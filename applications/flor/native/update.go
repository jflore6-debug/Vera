// Self-update: on each launch, Flor checks a small version file hosted in
// its own GitHub repo and, if newer than what's cached locally, downloads
// the latest built web app and serves that instead of the copy embedded in
// the binary at build time. This means shipping an update is just pushing
// new code — installed copies of Flor.app pick it up on their own next
// launch, with no reinstall needed. If the network is unavailable (or the
// check/download fails for any reason), it falls back to the most recent
// successful download, and ultimately to the embedded baseline — the app
// always launches even fully offline.
package main

import (
	"archive/zip"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

const (
	updateBaseURL         = "https://raw.githubusercontent.com/jflore6-debug/vera/main/applications/flor/update"
	updateCheckTimeout    = 1500 * time.Millisecond
	updateDownloadTimeout = 15 * time.Second
	updateMaxZipBytes     = 32 << 20 // 32MB safety cap
)

// resolveWebappDir returns a directory to serve the web app from, or "" if
// the caller should fall back to the binary's embedded baseline build.
func resolveWebappDir() string {
	cacheRoot := webappCacheRoot()
	localVersion := readLocalVersion(cacheRoot)

	if remoteVersion, ok := fetchRemoteVersion(); ok && remoteVersion > localVersion {
		if dir, err := downloadAndInstall(cacheRoot, remoteVersion); err == nil {
			return dir
		}
		// Version check succeeded but the download/install failed (offline
		// mid-download, disk full, corrupt archive, ...) — fall through to
		// whatever's already cached below rather than failing the launch.
	}

	if localVersion > 0 {
		dir := versionDir(cacheRoot, localVersion)
		if info, err := os.Stat(filepath.Join(dir, "index.html")); err == nil && !info.IsDir() {
			return dir
		}
	}
	return ""
}

func webappCacheRoot() string {
	home, err := os.UserHomeDir()
	if err != nil {
		return filepath.Join(os.TempDir(), "flor-webapp-cache")
	}
	return filepath.Join(home, "Library", "Application Support", "Flor", "webapp-cache")
}

func versionDir(root string, version int) string {
	return filepath.Join(root, "v"+strconv.Itoa(version))
}

func readLocalVersion(root string) int {
	data, err := os.ReadFile(filepath.Join(root, "current-version.txt"))
	if err != nil {
		return 0
	}
	v, err := strconv.Atoi(strings.TrimSpace(string(data)))
	if err != nil {
		return 0
	}
	return v
}

func writeLocalVersion(root string, version int) error {
	if err := os.MkdirAll(root, 0o755); err != nil {
		return err
	}
	return os.WriteFile(filepath.Join(root, "current-version.txt"), []byte(strconv.Itoa(version)), 0o644)
}

func fetchRemoteVersion() (int, bool) {
	client := &http.Client{Timeout: updateCheckTimeout}
	resp, err := client.Get(updateBaseURL + "/version.txt")
	if err != nil {
		return 0, false
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return 0, false
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, 64))
	if err != nil {
		return 0, false
	}
	v, err := strconv.Atoi(strings.TrimSpace(string(body)))
	if err != nil {
		return 0, false
	}
	return v, true
}

func downloadAndInstall(cacheRoot string, version int) (string, error) {
	client := &http.Client{Timeout: updateDownloadTimeout}
	resp, err := client.Get(updateBaseURL + "/webapp.zip")
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("update download failed: %s", resp.Status)
	}

	tmpZip, err := os.CreateTemp("", "flor-update-*.zip")
	if err != nil {
		return "", err
	}
	tmpZipPath := tmpZip.Name()
	defer os.Remove(tmpZipPath)

	_, copyErr := io.Copy(tmpZip, io.LimitReader(resp.Body, updateMaxZipBytes))
	closeErr := tmpZip.Close()
	if copyErr != nil {
		return "", copyErr
	}
	if closeErr != nil {
		return "", closeErr
	}

	dest := versionDir(cacheRoot, version)
	if err := extractZip(tmpZipPath, dest); err != nil {
		os.RemoveAll(dest)
		return "", err
	}
	if _, err := os.Stat(filepath.Join(dest, "index.html")); err != nil {
		os.RemoveAll(dest)
		return "", fmt.Errorf("update archive missing index.html")
	}

	if err := writeLocalVersion(cacheRoot, version); err != nil {
		return "", err
	}

	pruneOldVersions(cacheRoot, version)
	return dest, nil
}

// extractZip guards against zip-slip: every entry must resolve to a path
// inside destDir once cleaned, or the whole extraction is rejected.
func extractZip(zipPath, destDir string) error {
	r, err := zip.OpenReader(zipPath)
	if err != nil {
		return err
	}
	defer r.Close()

	if err := os.MkdirAll(destDir, 0o755); err != nil {
		return err
	}
	destAbs, err := filepath.Abs(destDir)
	if err != nil {
		return err
	}

	for _, f := range r.File {
		cleanName := filepath.Clean(f.Name)
		if strings.HasPrefix(cleanName, "..") || filepath.IsAbs(cleanName) {
			return fmt.Errorf("update archive contains an unsafe path: %s", f.Name)
		}
		target := filepath.Join(destAbs, cleanName)
		if target != destAbs && !strings.HasPrefix(target, destAbs+string(os.PathSeparator)) {
			return fmt.Errorf("update archive contains an unsafe path: %s", f.Name)
		}

		if f.FileInfo().IsDir() {
			if err := os.MkdirAll(target, 0o755); err != nil {
				return err
			}
			continue
		}
		if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
			return err
		}
		if err := extractZipFile(f, target); err != nil {
			return err
		}
	}
	return nil
}

func extractZipFile(f *zip.File, target string) error {
	rc, err := f.Open()
	if err != nil {
		return err
	}
	defer rc.Close()

	out, err := os.OpenFile(target, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0o644)
	if err != nil {
		return err
	}
	defer out.Close()

	_, err = io.Copy(out, rc)
	return err
}

// pruneOldVersions removes cached versions other than the one just
// installed, so the cache doesn't grow with every release.
func pruneOldVersions(cacheRoot string, keepVersion int) {
	entries, err := os.ReadDir(cacheRoot)
	if err != nil {
		return
	}
	keepName := "v" + strconv.Itoa(keepVersion)
	for _, e := range entries {
		if !e.IsDir() || !strings.HasPrefix(e.Name(), "v") || e.Name() == keepName {
			continue
		}
		if _, err := strconv.Atoi(strings.TrimPrefix(e.Name(), "v")); err == nil {
			os.RemoveAll(filepath.Join(cacheRoot, e.Name()))
		}
	}
}

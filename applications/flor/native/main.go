// Flor desktop launcher: serves the built web app on localhost and opens it
// in a chromeless app window (Chrome/Edge --app=, falling back to the
// default browser). This keeps the shipped app small — the UI itself is
// the same React app used in the browser, just embedded into the binary.
package main

import (
	"context"
	"embed"
	"io/fs"
	"log"
	"net"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"strconv"
	"syscall"
	"time"
)

//go:embed all:webapp
var webapp embed.FS

var appBrowserCandidates = []string{
	"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
	"/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
	"/Applications/Chromium.app/Contents/MacOS/Chromium",
	"/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
}

func findAppBrowser() string {
	for _, path := range appBrowserCandidates {
		if info, err := os.Stat(path); err == nil && !info.IsDir() {
			return path
		}
	}
	return ""
}

// resolveRoot picks the latest available web app: a self-updated copy on
// disk if one was fetched successfully (this launch or a previous one), or
// else the baseline embedded in the binary at build time.
func resolveRoot() fs.FS {
	if dir := resolveWebappDir(); dir != "" {
		log.Printf("flor: serving self-updated web app from %s", dir)
		return os.DirFS(dir)
	}
	embedded, err := fs.Sub(webapp, "webapp")
	if err != nil {
		log.Fatalf("flor: broken embedded app bundle: %v", err)
	}
	log.Print("flor: serving the embedded baseline web app")
	return embedded
}

func main() {
	root := resolveRoot()

	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		log.Fatalf("flor: could not open a local port: %v", err)
	}
	port := listener.Addr().(*net.TCPAddr).Port
	url := "http://127.0.0.1:" + strconv.Itoa(port) + "/"

	fileServer := http.FileServer(http.FS(root))
	mux := http.NewServeMux()
	mux.HandleFunc("/__flor/ping", heartbeatHandler)
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/" || r.URL.Path == "/index.html" {
			serveIndexWithHeartbeat(root, w, r)
			return
		}
		fileServer.ServeHTTP(w, r)
	})
	server := &http.Server{Handler: mux}

	go func() {
		if err := server.Serve(listener); err != nil && err != http.ErrServerClosed {
			log.Fatalf("flor: server error: %v", err)
		}
	}()

	// Give the listener a beat before we point a browser at it.
	time.Sleep(150 * time.Millisecond)

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	go watchHeartbeat(stop)

	if browser := findAppBrowser(); browser != "" {
		profileDir := chromeProfileDir()
		cmd := exec.Command(browser,
			"--app="+url,
			"--user-data-dir="+profileDir,
			"--no-first-run",
			"--no-default-browser-check",
		)
		// Deliberately not waiting on this process: on macOS the browser
		// can fork/re-exec, so it exiting doesn't mean the window closed.
		// Shutdown is driven by watchHeartbeat instead.
		if err := cmd.Start(); err != nil {
			openInDefaultBrowser(url)
		}
	} else {
		openInDefaultBrowser(url)
	}

	<-ctx.Done()
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	_ = server.Shutdown(shutdownCtx)
}

func openInDefaultBrowser(url string) {
	_ = exec.Command("open", url).Start()
}

// chromeProfileDir returns a stable, per-user location for the app-mode
// browser's profile (so saved projects in IndexedDB persist across
// launches). Falls back to a temp dir if the home directory is unavailable.
func chromeProfileDir() string {
	home, err := os.UserHomeDir()
	if err != nil {
		return filepath.Join(os.TempDir(), "flor-app-profile")
	}
	return filepath.Join(home, "Library", "Application Support", "Flor", "chrome-profile")
}

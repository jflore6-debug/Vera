// Shutdown is driven by a heartbeat from the page itself, not by watching
// the browser process we launched exit. On macOS, Chrome/Edge/Brave often
// fork or re-exec themselves, so the process Flor starts can exit almost
// immediately while the real browser window keeps running under a
// different PID — waiting on that process was causing Flor to shut its
// local server down right as the window tried to load it (ERR_CONNECTION_
// REFUSED). The page instead pings this server every couple of seconds;
// once those pings stop, the window is genuinely gone.
package main

import (
	"bytes"
	"io/fs"
	"net/http"
	"sync/atomic"
	"time"
)

const (
	heartbeatInterval = 2 * time.Second
	heartbeatTimeout  = 8 * time.Second  // no ping for this long -> treat as closed
	heartbeatGrace    = 15 * time.Second // time allowed for the very first load
)

var lastHeartbeat atomic.Int64 // unix millis of the last ping; 0 = none yet

func heartbeatHandler(w http.ResponseWriter, r *http.Request) {
	lastHeartbeat.Store(time.Now().UnixMilli())
	w.WriteHeader(http.StatusNoContent)
}

// watchHeartbeat blocks, calling onIdle once no heartbeat has arrived for
// heartbeatTimeout (after an initial grace period for the first load).
func watchHeartbeat(onIdle func()) {
	start := time.Now()
	ticker := time.NewTicker(heartbeatInterval)
	defer ticker.Stop()
	for range ticker.C {
		last := lastHeartbeat.Load()
		if last == 0 {
			if time.Since(start) > heartbeatGrace {
				onIdle()
				return
			}
			continue
		}
		if time.Since(time.UnixMilli(last)) > heartbeatTimeout {
			onIdle()
			return
		}
	}
}

const heartbeatScript = `<script>(function(){function ping(){fetch('/__flor/ping',{method:'POST'}).catch(function(){});}ping();setInterval(ping,` +
	`2000);window.addEventListener('pagehide',function(){try{navigator.sendBeacon('/__flor/ping');}catch(e){}});})();</script>`

// serveIndexWithHeartbeat serves index.html with the heartbeat script
// injected before </body>, so the page starts pinging as soon as it loads.
func serveIndexWithHeartbeat(root fs.FS, w http.ResponseWriter, r *http.Request) {
	data, err := fs.ReadFile(root, "index.html")
	if err != nil {
		http.Error(w, "index.html not found", http.StatusNotFound)
		return
	}
	injected := bytes.Replace(data, []byte("</body>"), []byte(heartbeatScript+"</body>"), 1)
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	_, _ = w.Write(injected)
}

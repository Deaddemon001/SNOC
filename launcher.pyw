"""
SimpleNOC v0.5.5.2 - Launcher
Double-click to start all services. Close window to quit.
"""
import subprocess, sys, os, threading, time, webbrowser
import noc_config as cfg
import tkinter as tk
from tkinter import messagebox

INSTALL_DIR = os.path.dirname(os.path.abspath(__file__))
PYTHON      = sys.executable
APP_VERSION = "0.5.5.2"
DASHBOARD_URL = (
    f"https://localhost:{cfg.HTTPS_PORT}"
    if getattr(cfg, "HTTPS_PORT", 0)
    else f"http://localhost:{getattr(cfg, 'API_PORT', 5000)}"
)

SERVICES = [
    ("SNMP Trap Receiver", "trap_receiver.py"),
    ("Syslog Server",      "syslog_server.py"),
    ("TFTP Server",        "tftp_server.py"),
    ("API and Dashboard",  "api.py"),
]

processes = {}

# ── TASK SCHEDULER CLEANUP ────────────────────────────────────────────────────
def remove_conflicting_tasks():
    """Remove any scheduled tasks that cause CMD windows to flash"""
    try:
        for task in ["SimpleNOC-API", "SimpleNOC-SNMP", "SimpleNOC-Syslog"]:
            subprocess.run(
                ['schtasks', '/Delete', '/TN', task, '/F'],
                capture_output=True,
                creationflags=subprocess.CREATE_NO_WINDOW
            )
    except Exception:
        pass

# ── SERVICE MANAGEMENT ───────────────────────────────────────────────────────
def start_service(name, script):
    if name in processes and processes[name].poll() is None:
        return
    path    = os.path.join(INSTALL_DIR, script)
    log_dir = os.path.join(INSTALL_DIR, "logs")
    os.makedirs(log_dir, exist_ok=True)
    log = open(os.path.join(log_dir, name.replace(' ', '_') + '.log'), 'a')
    kwargs = {}
    if sys.platform == 'win32':
        kwargs['creationflags'] = subprocess.CREATE_NO_WINDOW
    p = subprocess.Popen(
        [PYTHON, path], cwd=INSTALL_DIR,
        stdout=log, stderr=log, **kwargs
    )
    processes[name] = p

def stop_service(name):
    if name in processes:
        try:
            processes[name].terminate()
            processes[name].wait(timeout=3)
        except Exception:
            try: processes[name].kill()
            except: pass
        del processes[name]

def start_all():
    for name, script in SERVICES:
        start_service(name, script)
        time.sleep(1)
    try:
        # Open browser without flashing CMD window
        if sys.platform == 'win32':
            subprocess.Popen(
                ['cmd', '/c', 'start', '', DASHBOARD_URL],
                creationflags=subprocess.CREATE_NO_WINDOW
            )
        else:
            webbrowser.open(DASHBOARD_URL)
    except Exception:
        pass

def stop_all():
    # Stop API first, then others
    for name in reversed([s[0] for s in SERVICES]):
        stop_service(name)

# ── GUI ───────────────────────────────────────────────────────────────────────
class NOCApp:
    def __init__(self):
        self.root = tk.Tk()
        self.root.title("SimpleNOC v" + APP_VERSION)
        self.root.geometry("380x420")
        self.root.resizable(False, False)
        self.root.configure(bg="#0a1520")
        self.root.protocol("WM_DELETE_WINDOW", self.on_quit)

        # Header
        tk.Label(self.root, text="Simple NOC",
                 font=("Courier New", 18, "bold"),
                 fg="#00e5ff", bg="#0a1520").pack(pady=(18, 0))
        tk.Label(self.root, text="v" + APP_VERSION + " - Network Operations Center",
                 font=("Courier New", 9),
                 fg="#3a6070", bg="#0a1520").pack()

        # Status Panel
        self.status_frame = tk.LabelFrame(
            self.root, text=" Service Status ",
            font=("Courier New", 9, "bold"),
            fg="#00e5ff", bg="#0a1520", bd=1, relief="solid")
        self.status_frame.pack(fill="both", padx=20, pady=15)

        self.service_labels = {}
        for name, _ in SERVICES + [("Database Connection", None)]:
            f = tk.Frame(self.status_frame, bg="#0a1520")
            f.pack(fill="x", padx=10, pady=2)
            lbl = tk.Label(f, text="●", font=("Arial", 12), fg="#333333", bg="#0a1520")
            lbl.pack(side="left", padx=(0, 5))
            txt = tk.Label(f, text=name, font=("Courier New", 10), fg="#bbbbbb", bg="#0a1520")
            txt.pack(side="left")
            self.service_labels[name] = lbl

        # Action Buttons
        btn_frame = tk.Frame(self.root, bg="#0a1520")
        btn_frame.pack(pady=5)

        self.start_btn = tk.Button(
            btn_frame, text="Start All",
            font=("Courier New", 10, "bold"),
            fg="#39ff14", bg="#0a2a0a",
            activebackground="#0a3a0a",
            bd=1, relief="solid", width=14, height=2,
            command=self.on_start)
        self.start_btn.grid(row=0, column=0, padx=6)

        self.stop_btn = tk.Button(
            btn_frame, text="Stop All",
            font=("Courier New", 10, "bold"),
            fg="#ff2d55", bg="#2a0a0a",
            activebackground="#3a0a0a",
            bd=1, relief="solid", width=14, height=2,
            command=self.on_stop, state="disabled")
        self.stop_btn.grid(row=0, column=1, padx=6)

        tk.Button(
            self.root, text="Open Dashboard",
            font=("Courier New", 10),
            fg="#00e5ff", bg="#0a1520",
            activebackground="#0f2a3f",
            bd=1, relief="solid", width=32,
            command=lambda: webbrowser.open(DASHBOARD_URL)
        ).pack(pady=10)

        bottom = tk.Frame(self.root, bg="#0a1520")
        bottom.pack(side="bottom", fill="x", pady=5)
        tk.Button(
            bottom, text="Quit",
            font=("Courier New", 9), fg="#ff2d55", bg="#0a1520",
            bd=1, relief="solid", command=self.on_quit, width=8
        ).pack(pady=5)

        tk.Label(
            self.root, text=DASHBOARD_URL,
            font=("Courier New", 8), fg="#1a3a50",
            bg="#0a1520").pack(side="bottom")

        # Start monitoring loop
        self.update_status()
        
        # Auto-start on launch
        threading.Thread(target=self.auto_start, daemon=True).start()
        self.root.mainloop()

    def update_status(self):
        running_count = 0
        for name, _ in SERVICES:
            lbl = self.service_labels[name]
            is_running = name in processes and processes[name].poll() is None
            if is_running:
                lbl.config(fg="#39ff14") # Lime Green
                running_count += 1
            else:
                lbl.config(fg="#ff2d55") # Pink Red
        
        # Check Database Connection
        db_lbl = self.service_labels.get("Database Connection")
        if db_lbl:
            api_running = (
                "API and Dashboard" in processes and
                processes["API and Dashboard"].poll() is None
            )
            if api_running:
                try:
                    conn = cfg.get_db_connection()
                    if conn:
                        db_lbl.config(fg="#39ff14")
                        conn.close()
                    else:
                        db_lbl.config(fg="#ff2d55")
                except Exception:
                    db_lbl.config(fg="#ff2d55")
            else:
                db_lbl.config(fg="#ff2d55")

        if running_count == len(SERVICES):
            self.start_btn.config(state="disabled")
            self.stop_btn.config(state="normal")
        elif running_count == 0:
            self.start_btn.config(state="normal")
            self.stop_btn.config(state="disabled")
        else:
            self.start_btn.config(state="normal")
            self.stop_btn.config(state="normal")
            
        self.root.after(2000, self.update_status)

    def auto_start(self):
        remove_conflicting_tasks()
        time.sleep(0.5)
        self.on_start()

    def on_start(self):
        self.start_btn.config(state="disabled")
        threading.Thread(target=start_all, daemon=True).start()

    def on_stop(self):
        self.stop_btn.config(state="disabled")
        threading.Thread(target=stop_all, daemon=True).start()

    def on_quit(self):
        result = messagebox.askyesno(
            "Quit SimpleNOC",
            "Stop all services and quit SimpleNOC?",
            icon="warning"
        )
        if result:
            stop_all()
            self.root.destroy()

if __name__ == "__main__":
    NOCApp()

"""
Simple NOC v0.5.5.1 - Setup & Installer
Run as Administrator: python setup.py
"""
import subprocess, sys, os, time, shutil, ctypes, re, tempfile

APP_NAME    = "SimpleNOC"
APP_VERSION = "0.5.5.1"
INSTALL_DIR = r"C:\SimpleNOC"
DASHBOARD_URL = "https://localhost:5443"
SERVICES = [
    ("SimpleNOC-API", "api.py", "NOC Dashboard & API Server"),
    ("SimpleNOC-SNMP", "trap_receiver.py", "SNMP Trap Receiver"),
    ("SimpleNOC-Syslog", "syslog_server.py", "Syslog Server"),
]
TASK_NAMES = [name for name, _, _ in SERVICES]
def find_real_python():
    """Find real Python — skip Windows Store stub"""
    import os
    # If current executable is NOT the Store stub, use it
    exe = sys.executable
    if 'WindowsApps' not in exe:
        return exe
    # Search common install paths
    candidates = [
        r"C:\Python313\python.exe",
        r"C:\Python312\python.exe",
        r"C:\Python311\python.exe",
        r"C:\Python310\python.exe",
        os.path.expandvars(r"%LOCALAPPDATA%\Programs\Python\Python313\python.exe"),
        os.path.expandvars(r"%LOCALAPPDATA%\Programs\Python\Python312\python.exe"),
        os.path.expandvars(r"%LOCALAPPDATA%\Programs\Python\Python311\python.exe"),
        os.path.expandvars(r"%LOCALAPPDATA%\Programs\Python\Python310\python.exe"),
        os.path.expandvars(r"%PROGRAMFILES%\Python313\python.exe"),
        os.path.expandvars(r"%PROGRAMFILES%\Python312\python.exe"),
    ]
    for c in candidates:
        if os.path.exists(c):
            return c
    # Try py launcher
    try:
        result = subprocess.run(['py', '-c', 'import sys; print(sys.executable)'],
                                capture_output=True, text=True, timeout=5)
        if result.returncode == 0:
            p = result.stdout.strip()
            if p and 'WindowsApps' not in p:
                return p
    except Exception:
        pass
    return exe  # fallback

PYTHON = find_real_python()

REQUIRED_PACKAGES = [
    "flask",
    "flask-cors",
    "pysnmp",
    "paramiko",
    "psycopg2-binary",
]

BANNER = r"""
  ____  _                 _        _   _  ___   ____
 / ___|(_)_ __ ___  _ __ | | ___  | \ | |/ _ \ / ___|
 \___ \| | '_ ` _ \| '_ \| |/ _ \ |  \| | | | | |
  ___) | | | | | | | |_) | |  __/ | |\  | |_| | |___
 |____/|_|_| |_| |_| .__/|_|\___| |_| \_|\___/ \____|
                    |_|
         v0.5.5.1 - Network Operations Center
"""

def is_admin():
    try:
        return ctypes.windll.shell32.IsUserAnAdmin()
    except:
        return False

def run(cmd, check=True):
    print(f"  >> {' '.join(cmd) if isinstance(cmd, list) else cmd}")
    result = subprocess.run(cmd, shell=isinstance(cmd, str),
                            capture_output=True, text=True)
    if result.stdout.strip():
        print(f"     {result.stdout.strip()[:200]}")
    if check and result.returncode != 0:
        print(f"  ERROR: {result.stderr.strip()[:200]}")
    return result.returncode == 0

def step(msg):
    print(f"\n[*] {msg}")

def ok(msg):
    print(f"  OK  {msg}")

def warn(msg):
    print(f"  !! {msg}")

def install_packages():
    step("Installing Python packages...")
    for pkg in REQUIRED_PACKAGES:
        print(f"  Installing {pkg}...")
        ok_flag = run([PYTHON, "-m", "pip", "install", pkg, "--quiet"])
        if ok_flag:
            ok(pkg)
        else:
            warn(f"Failed to install {pkg} - please run: pip install {pkg}")

def create_install_dir():
    step(f"Setting up install directory: {INSTALL_DIR}")
    os.makedirs(INSTALL_DIR, exist_ok=True)
    os.makedirs(os.path.join(INSTALL_DIR, "data"), exist_ok=True)
    ok("Data directory: C:\\SimpleNOC\\data\\ (databases stored here)")
    ok(f"Directory ready: {INSTALL_DIR}")

def copy_files():
    step("Copying application files...")
    src = os.path.dirname(os.path.abspath(__file__))
    files = [
        "api.py",
        "trap_receiver.py",
        "syslog_server.py",
        "vsol_mib.py",
        "noc_config.py",
        "dashboard.html",
        "login.html",
        "launcher.pyw",
        "gen_cert.py",
        "alert_engine.py",
        "tftp_server.py",
        "olt_connector.py",
        "init_postgres.sql",
        "setup_postgres.bat",
        "run.bat",
        "INSTALL.bat",
        "START_NOC.bat",
        "STOP_NOC.bat",
        "STATUS_NOC.bat",
        "remove_tasks.bat",
    ]
    for f in files:
        src_path = os.path.join(src, f)
        dst_path = os.path.join(INSTALL_DIR, f)
        if os.path.exists(src_path):
            # Skip if source and destination are the same file
            if os.path.abspath(src_path) == os.path.abspath(dst_path):
                ok(f"Already in place: {f}")
            else:
                shutil.copy2(src_path, dst_path)
                ok(f"Copied {f}")
        else:
            warn(f"Missing: {f} — copy it to {src} then re-run")

def write_service_wrapper(name, script):
    """Write a .bat wrapper for each service"""
    bat = os.path.join(INSTALL_DIR, f"run_{name}.bat")
    content = f'@echo off\ncd /d "{INSTALL_DIR}"\n"{PYTHON}" "{os.path.join(INSTALL_DIR, script)}"\n'
    with open(bat, 'w') as f:
        f.write(content)
    ok(f"Service wrapper: run_{name}.bat")
    return bat

def install_services():
    step("Installing Windows Services...")

    # Check if NSSM is available
    nssm = shutil.which("nssm")
    if not nssm:
        nssm_path = os.path.join(INSTALL_DIR, "nssm.exe")
        if os.path.exists(nssm_path):
            nssm = nssm_path

    services = [
        ("SimpleNOC-API",     "api.py",           "NOC Dashboard & API Server"),
        ("SimpleNOC-SNMP",    "trap_receiver.py", "SNMP Trap Receiver"),
        ("SimpleNOC-Syslog",  "syslog_server.py", "Syslog Server"),
    ]

    if nssm:
        ok("NSSM found — installing as proper Windows Services")
        for svc_name, script, desc in SERVICES:
            script_path = os.path.join(INSTALL_DIR, script)
            # Remove existing service if present
            run([nssm, "stop",   svc_name], check=False)
            run([nssm, "remove", svc_name, "confirm"], check=False)
            # Install new
            run([nssm, "install", svc_name, PYTHON, script_path])
            run([nssm, "set", svc_name, "AppDirectory", INSTALL_DIR])
            run([nssm, "set", svc_name, "Description", desc])
            run([nssm, "set", svc_name, "Start", "SERVICE_AUTO_START"])
            run([nssm, "set", svc_name, "AppStdout",
                 os.path.join(INSTALL_DIR, f"logs\\{svc_name}.log")])
            run([nssm, "set", svc_name, "AppStderr",
                 os.path.join(INSTALL_DIR, f"logs\\{svc_name}_err.log")])
            ok(f"Service installed: {svc_name}")
        return True
    else:
        warn("NSSM not found — launcher.pyw will manage all services")
        warn("To auto-start on boot: add launcher.pyw shortcut to Windows Startup folder")
        return False

def install_task_scheduler(services):
    """Fallback: use Windows Task Scheduler to run on startup"""
    step("Installing via Task Scheduler (fallback)...")
    for svc_name, script, desc in services:
        script_path = os.path.join(INSTALL_DIR, script)
        bat_path    = write_service_wrapper(svc_name.split('-')[1].lower(), script)
        task_xml    = f"""<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo><Description>{desc}</Description></RegistrationInfo>
  <Triggers><BootTrigger><Enabled>true</Enabled></BootTrigger></Triggers>
  <Principals><Principal><RunLevel>HighestAvailable</RunLevel></Principal></Principals>
  <Settings><MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>
    <RestartOnFailure><Interval>PT1M</Interval><Count>999</Count></RestartOnFailure>
  </Settings>
  <Actions><Exec>
    <Command>"{PYTHON}"</Command>
    <Arguments>"{script_path}"</Arguments>
    <WorkingDirectory>{INSTALL_DIR}</WorkingDirectory>
  </Exec></Actions>
</Task>"""
        xml_path = os.path.join(INSTALL_DIR, f"{svc_name}.xml")
        with open(xml_path, 'w', encoding='utf-8') as f:
            f.write(task_xml)
        run(f'schtasks /Create /TN "{svc_name}" /XML "{xml_path}" /F', check=False)
        ok(f"Task scheduled: {svc_name}")

def remove_old_tasks():
    step("Removing any conflicting Task Scheduler entries...")
    for task in TASK_NAMES:
        run(f'schtasks /Delete /TN "{task}" /F', check=False)
    ok("Task Scheduler cleaned")

def create_logs_dir():
    logs = os.path.join(INSTALL_DIR, "logs")
    os.makedirs(logs, exist_ok=True)
    ok("Logs directory created")

def create_shortcuts():
    step("Creating shortcuts...")
    # Desktop shortcut to open dashboard
    desktop  = os.path.join(os.environ.get('USERPROFILE',''), 'Desktop')
    startmenu = os.path.join(os.environ.get('APPDATA',''),
                             r'Microsoft\Windows\Start Menu\Programs\SimpleNOC')
    os.makedirs(startmenu, exist_ok=True)

    shortcut_script = f"""
import winshell, win32com.client
from pathlib import Path

shell = win32com.client.Dispatch("WScript.Shell")
for folder in [r"{desktop}", r"{startmenu}"]:
    sc = shell.CreateShortCut(str(Path(folder) / "SimpleNOC Dashboard.lnk"))
    sc.TargetPath = "{DASHBOARD_URL}"
    sc.Description = "Open SimpleNOC Dashboard"
    sc.save()
"""
    # Try creating URL shortcut (simpler, no extra packages needed)
    for folder in [desktop, startmenu]:
        url_file = os.path.join(folder, "SimpleNOC Dashboard.url")
        try:
            with open(url_file, 'w') as f:
                f.write(f"[InternetShortcut]\nURL={DASHBOARD_URL}\n")
            ok(f"Shortcut created: {url_file}")
        except Exception as e:
            warn(f"Could not create shortcut in {folder}: {e}")

    # Also create a control panel shortcut
    ctrl_url = os.path.join(desktop, "SimpleNOC Control.url")
    try:
        with open(ctrl_url, 'w') as f:
            f.write(f"[InternetShortcut]\nURL=file:///{INSTALL_DIR}/control.html\n")
    except:
        pass

def create_control_bat():
    """Create start/stop/status batch files"""
    step("Creating control scripts...")

    # Start all
    start_bat = os.path.join(INSTALL_DIR, "START_NOC.bat")
    with open(start_bat, 'w', encoding='utf-8') as f:
        f.write(f"""@echo off
title SimpleNOC v{APP_VERSION} - Starting...
echo.
echo  Starting SimpleNOC v{APP_VERSION}...
echo.

net session >nul 2>&1
if %errorLevel% neq 0 (
    echo Run as Administrator!
    pause & exit
)

echo [1/3] Starting SNMP Trap Receiver...
start "SimpleNOC SNMP" /min cmd /c "cd /d {INSTALL_DIR} && {PYTHON} trap_receiver.py >> logs\\snmp.log 2>&1"
timeout /t 2 /nobreak >nul

echo [2/3] Starting Syslog Server...
start "SimpleNOC Syslog" /min cmd /c "cd /d {INSTALL_DIR} && {PYTHON} syslog_server.py >> logs\\syslog.log 2>&1"
timeout /t 2 /nobreak >nul

echo [3/3] Starting API & Dashboard...
start "SimpleNOC API" /min cmd /c "cd /d {INSTALL_DIR} && {PYTHON} api.py >> logs\\api.log 2>&1"
timeout /t 3 /nobreak >nul

echo.
echo  All services started!
echo  Dashboard: """ + DASHBOARD_URL + """
echo.
start """ + DASHBOARD_URL + """
""")
    ok("START_NOC.bat")

    # Stop all
    stop_bat = os.path.join(INSTALL_DIR, "STOP_NOC.bat")
    with open(stop_bat, 'w', encoding='utf-8') as f:
        f.write("""@echo off
echo Stopping SimpleNOC...
taskkill /FI "WindowTitle eq SimpleNOC*" /F >nul 2>&1
echo Done.
""")
    ok("STOP_NOC.bat")

    # Status check
    status_bat = os.path.join(INSTALL_DIR, "STATUS_NOC.bat")
    with open(status_bat, 'w', encoding='utf-8') as f:
        f.write(f"""@echo off
echo SimpleNOC v{APP_VERSION} Status
echo ========================
tasklist /FI "WindowTitle eq SimpleNOC*" 2>nul | find /I "cmd.exe" >nul
if %errorLevel%==0 (echo  Services: RUNNING) else (echo  Services: STOPPED)
echo  Dashboard: """ + DASHBOARD_URL + """
echo.
pause
""")
    ok("STATUS_NOC.bat")

def create_launcher():
    """Copy launcher.pyw from setup folder to install directory"""
    src_launcher = os.path.join(os.path.dirname(os.path.abspath(__file__)), "launcher.pyw")
    dst_launcher = os.path.join(INSTALL_DIR, "launcher.pyw")

    if os.path.abspath(src_launcher) == os.path.abspath(dst_launcher):
        ok("launcher.pyw already in place")
        return

    if os.path.exists(src_launcher):
        shutil.copy2(src_launcher, dst_launcher)
        ok("launcher.pyw copied to " + INSTALL_DIR)
    else:
        warn("launcher.pyw not found in setup folder — skipping")


def prompt_yes_no(message, default=True):
    suffix = " [Y/n]: " if default else " [y/N]: "
    answer = input(message + suffix).strip().lower()
    if not answer:
        return default
    return answer in ("y", "yes")

def find_nssm():
    nssm = shutil.which("nssm")
    if not nssm:
        nssm_path = os.path.join(INSTALL_DIR, "nssm.exe")
        if os.path.exists(nssm_path):
            nssm = nssm_path
    return nssm

def stop_and_remove_services():
    step("Stopping and removing SimpleNOC services...")
    nssm = find_nssm()
    for svc_name, _, _ in SERVICES:
        if nssm:
            run([nssm, "stop", svc_name], check=False)
            run([nssm, "remove", svc_name, "confirm"], check=False)
        run(["sc", "stop", svc_name], check=False)
        run(["sc", "delete", svc_name], check=False)
    ok("Windows services removed")

def stop_running_processes():
    step("Stopping running SimpleNOC processes...")
    for title in ["SimpleNOC*", "NOC-API*", "NOC-SNMP*", "NOC-Syslog*"]:
        run(f'taskkill /FI "WindowTitle eq {title}" /F', check=False)
    ok("Running console processes stopped")

def remove_shortcuts():
    step("Removing shortcuts...")
    desktop = os.path.join(os.environ.get('USERPROFILE', ''), 'Desktop')
    startmenu = os.path.join(
        os.environ.get('APPDATA', ''),
        r'Microsoft\Windows\Start Menu\Programs\SimpleNOC'
    )
    shortcut_paths = [
        os.path.join(desktop, "SimpleNOC Dashboard.url"),
        os.path.join(desktop, "SimpleNOC Control.url"),
        os.path.join(startmenu, "SimpleNOC Dashboard.url"),
    ]
    for path in shortcut_paths:
        if os.path.exists(path):
            try:
                os.remove(path)
                ok(f"Removed {path}")
            except Exception as e:
                warn(f"Could not remove {path}: {e}")
    if os.path.isdir(startmenu):
        try:
            shutil.rmtree(startmenu, ignore_errors=True)
            ok(f"Removed {startmenu}")
        except Exception as e:
            warn(f"Could not remove {startmenu}: {e}")

def schedule_install_dir_removal():
    cleanup_bat = os.path.join(tempfile.gettempdir(), "simplenoc_cleanup.bat")
    with open(cleanup_bat, "w", encoding="utf-8") as f:
        f.write(
            "@echo off\n"
            "timeout /t 2 /nobreak >nul\n"
            f'rmdir /S /Q "{INSTALL_DIR}"\n'
            'del "%~f0"\n'
        )
    subprocess.Popen(["cmd", "/c", cleanup_bat], creationflags=subprocess.CREATE_NO_WINDOW)

def uninstall_app():
    print(BANNER)
    print(f"  Uninstalling {APP_NAME} v{APP_VERSION}")
    print(f"  Target: {INSTALL_DIR}\n")

    if not os.path.exists(INSTALL_DIR):
        warn(f"Install directory not found: {INSTALL_DIR}")
        return

    preserve_data = prompt_yes_no("Preserve existing data and backups before uninstall?", default=True)
    data_backup = None
    if preserve_data:
        timestamp = time.strftime("%Y%m%d_%H%M%S")
        data_backup = os.path.join(os.path.dirname(INSTALL_DIR), f"SimpleNOC_data_backup_{timestamp}")

    stop_and_remove_services()
    remove_old_tasks()
    stop_running_processes()
    remove_shortcuts()

    if preserve_data:
        for folder_name in ["data", "backups", "logs"]:
            src = os.path.join(INSTALL_DIR, folder_name)
            if os.path.exists(src):
                os.makedirs(data_backup, exist_ok=True)
                dst = os.path.join(data_backup, folder_name)
                try:
                    if os.path.exists(dst):
                        shutil.rmtree(dst, ignore_errors=True)
                    shutil.copytree(src, dst)
                    ok(f"Preserved {folder_name} to {dst}")
                except Exception as e:
                    warn(f"Could not preserve {folder_name}: {e}")

    schedule_install_dir_removal()
    ok(f"Uninstall scheduled for {INSTALL_DIR}")
    if data_backup:
        ok(f"Data backup saved in {data_backup}")
    print("\n  Uninstall complete. You can close this window.")

def print_summary(nssm_installed):
    print("\n" + "="*55)
    print(f"  SimpleNOC v{APP_VERSION} Installation Complete!")
    print("="*55)
    print(f"\n  Install directory : {INSTALL_DIR}")
    print(f"\n  To START SimpleNOC:")
    print(f"    Double-click: {INSTALL_DIR}\\launcher.pyw")
    print(f"    OR run:       {INSTALL_DIR}\\START_NOC.bat  (as Admin)")
    if nssm_installed:
        print(f"\n  Windows Services installed (auto-start on boot)")
        print(f"    net start SimpleNOC-API")
        print(f"    net start SimpleNOC-SNMP")
        print(f"    net start SimpleNOC-Syslog")
    print(f"\n  Dashboard: {DASHBOARD_URL}")
    print(f"\n  Unified maintenance launcher: {INSTALL_DIR}\\run.bat")
    print(f"\n  Logs: {INSTALL_DIR}\\logs\\")
    print("="*55 + "\n")


def install_app():
    print(BANNER)
    print(f"  Installing Simple NOC v{APP_VERSION} on Windows")
    print(f"  Python: {PYTHON}")
    print()

    if not is_admin():
        print("  WARNING: Not running as Administrator.")
        print("  Some features (Windows Services, port 162/514) require Admin.")
        print("  Re-run as Administrator for full installation.\n")
        input("  Press Enter to continue with limited install...")

    install_packages()
    create_install_dir()
    create_logs_dir()
    copy_files()
    nssm_ok = install_services()
    remove_old_tasks()
    create_control_bat()
    create_launcher()
    create_shortcuts()
    print_summary(nssm_ok)

    input("\n  Press Enter to launch SimpleNOC now...")
    subprocess.Popen([PYTHON, os.path.join(INSTALL_DIR, "launcher.pyw")])

def main():
    action = sys.argv[1].strip().lower() if len(sys.argv) > 1 else "install"
    if action == "install":
        install_app()
        sys.exit(0)
    elif action == "uninstall":
        uninstall_app()
        sys.exit(0)
    else:
        print("Usage: python setup.py [install|uninstall]")
        sys.exit(1)

if __name__ == "__main__":
    main()

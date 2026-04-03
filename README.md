# SimpleNOC v0.5.5

SimpleNOC is a Windows-based Network Operations Center application with a web dashboard, SNMP trap receiver, syslog server, TFTP server, OLT polling, alerting, and PostgreSQL migration support.

## Prerequisites

Before installing SimpleNOC on a new machine, make sure these items are ready:

- Windows 10 or Windows Server with Administrator access
- Python 3.10 or newer
- PostgreSQL installed if you want to use PostgreSQL instead of SQLite
- Network access and firewall rules for the required ports

## Required Software

### 1. Python

Install Python from:

- [https://www.python.org/downloads/](https://www.python.org/downloads/)

During installation:

- Enable `Add Python to PATH`
- Prefer `Install for all users`

### 2. PostgreSQL

Install PostgreSQL from:

- [https://www.postgresql.org/download/windows/](https://www.postgresql.org/download/windows/)

Recommended notes:

- Install the PostgreSQL Server
- Keep the `psql` command line tools installed
- Remember the PostgreSQL superuser password
- Default service port is `5432`

SimpleNOC setup tries to auto-detect PostgreSQL in common locations such as:

- `C:\Program Files\PostgreSQL\18\bin`
- `C:\Program Files\PostgreSQL\17\bin`
- `C:\Program Files\PostgreSQL\16\bin`

If PostgreSQL is installed in a custom location, the setup script will ask for the `bin` folder path.

## Network Ports

SimpleNOC uses these ports by default:

- `5000` - HTTP dashboard
- `5443` - HTTPS dashboard
- `162` - SNMP trap receiver
- `5141` - Syslog server
- `69` - TFTP server
- `5432` - PostgreSQL

Make sure these ports are allowed by Windows Firewall and not already in use.

## Installation

Run this file as Administrator:

```bat
run.bat
```

The setup menu supports:

- Install or update the app
- Setup PostgreSQL
- Uninstall the app

## PostgreSQL Setup Flow

If you are installing on a fresh machine:

1. Install PostgreSQL first.
2. Run `run.bat`.
3. Choose `1. Install or Update SimpleNOC`.
4. After the install finishes and returns to the menu, choose `2. Setup PostgreSQL Database`.
5. Enter the PostgreSQL superuser name if needed. Default is `postgres`.
6. Let the script create the SimpleNOC database and application user.

The PostgreSQL setup creates:

- Database: `simplenoc`
- App user: `adminsql`
- App password: same as username (`adminsql`)

## Installed Location

By default, SimpleNOC installs to:

```text
C:\SimpleNOC
```

Important files after install:

- `C:\SimpleNOC\run.bat`
- `C:\SimpleNOC\START_NOC.bat`
- `C:\SimpleNOC\STOP_NOC.bat`
- `C:\SimpleNOC\noc_config.py`

## Default Login

If no users exist yet, the app creates:

- Username: `admin`
- Password: `admin123`

Change this password after first login.

## Notes

- `run.bat` should be the main entry point for customers.
- SimpleNOC now runs on PostgreSQL only.
- Database retention limits for each module can be adjusted in `C:\SimpleNOC\noc_config.py`.

# Smart NOC â€” Software Architecture Document
**Application Version:** `v0.5.6.4`  
**Target Environment:** Windows 10 / 11 / Windows Server (24x7 Headless / Desktop Operation)  
**Database Engine:** PostgreSQL 12+  
**Primary Language:** Python 3.10+ / HTML5 / CSS3 / Vanilla JavaScript / Chart.js  

---

## 1. Executive Summary & System Overview

**Smart NOC** is a modular, high-availability Network Operations Center (NOC) monitoring and management platform specifically engineered for Internet Service Providers (ISPs), fiber networks, and Optical Line Terminal (OLT) deployments.

The platform unifies real-time event telemetry (SNMP Traps, Syslog), file backup intake (TFTP), ICMP ping reachability, OLT/ONT optical inventory extraction, multi-channel alert dispatching (Discord, Telegram, Email), and in-app system power management into a cohesive, single-pane-of-glass architecture.

```mermaid
graph TD
    subgraph Network Devices [Network Infrastructure]
        OLT[OLT / Switches / Routers]
        ONT[Customer ONUs / ONTs]
    end

    subgraph Ingestion Layer [Network Ingestion Daemons]
        TRAP[trap_receiver.py<br/>UDP 162]
        SYSLOG[syslog_server.py<br/>UDP 5141]
        TFTP[tftp_server.py<br/>UDP 69]
        OLT_CONN[olt_connector.py<br/>SSH / Telnet]
    end

    subgraph Core Engine Layer [Application Core & APIs]
        API[api.py<br/>Flask Web & REST API<br/>TCP 5000 / 5443]
        ALERT[alert_engine.py<br/>Multi-Channel Notifier]
        PING[Ping Engine Worker<br/>in api.py]
        HEALTH[Health & Power Manager<br/>in api.py]
        LAUNCHER[launcher.pyw<br/>Process Supervisor & Watchdog]
    end

    subgraph Storage Layer [Persistence]
        PG[(PostgreSQL DB<br/>Smart NOC Instance)]
        FS[Local File Storage<br/>/backups, /logs, /data]
    end

    subgraph Notification Layer [External Notifications]
        DISCORD[Discord Webhooks<br/>Color-Coded Embeds]
        EMAIL[SMTP Email Server<br/>HTML & Status Dots]
        TG[Telegram Bot API<br/>HTML Formatted]
    end

    subgraph Presentation Layer [User Interfaces]
        DASH[dashboard.html<br/>11 Functional Tabs<br/>Chart.js Visualizations]
        LOGIN[login.html<br/>PBKDF2 Auth & Session Control]
    end

    %% Network flows
    OLT -- "SNMP Traps (UDP 162)" --> TRAP
    OLT -- "Syslog Messages (UDP 5141)" --> SYSLOG
    OLT -- "Config Backups (UDP 69)" --> TFTP
    OLT_CONN -- "CLI Polling (SSH/Telnet)" --> OLT
    PING -- "ICMP Echo" --> OLT
    PING -- "ICMP Echo" --> ONT

    %% Process Supervision
    LAUNCHER -.->|Supervises & Restarts| TRAP
    LAUNCHER -.->|Supervises & Restarts| SYSLOG
    LAUNCHER -.->|Supervises & Restarts| TFTP
    LAUNCHER -.->|Supervises & Restarts| API

    %% Processing to Storage & Alerting
    TRAP -->|Parsed Traps & Events| PG
    TRAP -->|Trigger Rule Eval| ALERT
    SYSLOG -->|Parsed Logs & Events| PG
    SYSLOG -->|Trigger Rule Eval| ALERT
    TFTP -->|Store File & Metadata| PG
    TFTP -->|Write File| FS
    OLT_CONN -->|ONU & Uplink Records| PG
    PING -->|Ping State & Latency| PG
    PING -->|Trigger Offline/Restore| ALERT
    HEALTH -->|System & Process Diagnostics| PG

    %% Alerting out
    ALERT --> DISCORD
    ALERT --> EMAIL
    ALERT --> TG
    ALERT -->|Log Dispatched Alerts| PG

    %% Presentation to API
    API <-->|SQL Queries / Connection Pool| PG
    API <-->|Read / Write Backups & Logs| FS
    API -->|Serves Web UI & REST Data| DASH
    API -->|Serves Auth Views| LOGIN
```

---

## 2. File & Component Interdependency Matrix

The application follows a decoupled daemon architecture where all components communicate asynchronously through shared database tables, common configuration tokens, and loopback REST calls.

| Component / File | Process Type | Primary Responsibilities | Key Upstream & Downstream Dependencies |
| :--- | :--- | :--- | :--- |
| [`noc_config.py`](file:///e:/antigravity/noc_config.py) | **Configuration** | Central configuration repository, port mappings, retention parameters, and PostgreSQL connection pool initialization (`query_db`, `execute_db`, `get_db_connection`). | Imported by **all** Python modules (`api.py`, `alert_engine.py`, `trap_receiver.py`, `syslog_server.py`, `tftp_server.py`, `olt_connector.py`, `launcher.pyw`). |
| [`launcher.pyw`](file:///e:/antigravity/launcher.pyw) | **Supervisor GUI** | Process orchestrator, Tkinter tray/window controller, service heartbeat monitor, and self-healing watchdog (auto-restarts hanging API instances). | Spawns `api.py`, `trap_receiver.py`, `syslog_server.py`, `tftp_server.py`; communicates via HTTP health checks. |
| [`api.py`](file:///e:/antigravity/api.py) | **Web Server & Core API** | Flask application (HTTP 5000 / HTTPS 5443), PBKDF2 authentication, RBAC session handling, REST API endpoints, background Ping Worker, Retention Cleanup, Diagnostic Health Engine, and Power Lifecycle handlers (`/api/system/restart`, `/api/system/shutdown`). | Reads/writes PostgreSQL via `noc_config.py`; serves `dashboard.html` and `login.html`; executes `alert_engine.py` for ping triggers; calls `olt_connector.py` for live scans. |
| [`dashboard.html`](file:///e:/antigravity/dashboard.html) | **Presentation SPA** | Single-page UI with 11 operational tabs (Dashboard Health, Syslog, SNMP, TFTP, Ping, Alerts, OLT, Uplink, Logs, ONT, Users), Chart.js real-time graphing, drag-and-drop tab ordering, and modal management. | Fetches data from `api.py` REST endpoints via secure cookie session; invokes power commands and live poll jobs. |
| [`login.html`](file:///e:/antigravity/login.html) | **Authentication UI** | Cyberpunk-themed standalone login page handling credentials, error notifications, and secure cookie creation. | Submits authentication requests to `api.py` (`POST /api/auth/login`). |
| [`alert_engine.py`](file:///e:/antigravity/alert_engine.py) | **Alerting Service** | Direct multi-channel rule matching engine for Syslog events and Ping state changes; builds color-coded notifications (ðŸ”´ Red for DOWN, ðŸŸ¢ Green for UP, ðŸŸ¡ Yellow for Warning) and dispatches directly via Discord Embeds, Telegram Bot API, and SMTP HTML emails without user binding bottlenecks. | Invoked by `syslog_server.py`, `trap_receiver.py`, and `api.py` (Ping Worker); writes alert logs to PostgreSQL table `alert_log`. |
| [`syslog_server.py`](file:///e:/antigravity/syslog_server.py) | **UDP Ingestion Daemon** | Listens on UDP port 5141, parses RFC 3164/5424 syslog streams, enforces Device Security Registration (Allow/Deny/Delete), persists to `syslog` table, and triggers rule checks in `alert_engine.py` with explicit error logging. | Uses `noc_config.py` for DB connection and settings; calls `alert_engine.process_alert()`. |
| [`trap_receiver.py`](file:///e:/antigravity/trap_receiver.py) | **UDP Ingestion Daemon** | Listens on UDP port 162, decodes SNMP v1/v2c trap payloads via PySNMP, translates enterprise OIDs via `vsol_mib.py`, persists records in `traps` table, and flags event alerts. | Uses `vsol_mib.py` for OID translation; uses `noc_config.py` for database persistence. |
| [`tftp_server.py`](file:///e:/antigravity/tftp_server.py) | **UDP Ingestion Daemon** | Listens on UDP port 69, accepts binary and text configuration upload requests from network switches/OLTs, saves files to `/backups/`, and indexes records in `tftp_files`. | Uses `noc_config.py` for ports and directories; updates PostgreSQL `tftp_files` table. |
| [`olt_connector.py`](file:///e:/antigravity/olt_connector.py) | **Hardware Library** | Paramiko-based SSH/Telnet automation engine for ZTE, VSOL, Huawei, and Fiberhome OLTs. Polls ONU tables, optical power (Rx/Tx dBm), CATV status, and interface uplink traffic counters. | Called by `api.py` during live scan requests and background scheduler worker (`olt_job_scheduler`). |
| [`vsol_mib.py`](file:///e:/antigravity/vsol_mib.py) | **MIB Translation** | Static mapping table and translation parser for standard RFC MIBs and VSOL Enterprise OIDs (Enterprise ID `37950`). | Imported by `trap_receiver.py` and `olt_connector.py`. |
| [`gen_cert.py`](file:///e:/antigravity/gen_cert.py) | **Security Tool** | Generates self-signed 2048-bit RSA TLS/SSL certificates (`server.crt` and `server.key`) with Subject Alternative Names (SAN) for HTTPS support. | Run during installation or setup to provide HTTPS certificates for `api.py`. |
| [`check_downtime.py`](file:///e:/antigravity/check_downtime.py) | **Audit Tool** | Audits background service log files (`logs/`) to detect time gaps and historical downtime intervals between consecutive heartbeat entries. | Standalone administrative command-line utility. |

---

## 3. Data Flow & Processing Pipelines

### 3.1. Telemetry Ingestion & Real-Time Alerting Pipeline
```mermaid
sequenceDiagram
    autonumber
    actor OLT as OLT / Switch
    participant SYSLOG as syslog_server.py (UDP 5141)
    participant DB as PostgreSQL Database
    participant ALERT as alert_engine.py
    participant DISCORD as Discord / Telegram / SMTP
    participant DASH as dashboard.html (Client)

    OLT->>SYSLOG: UDP Syslog Packet ("Uplink-port 0/1 Down")
    SYSLOG->>DB: Check Device Authorized (syslog_devices)
    alt Device Denied / Unregistered
        SYSLOG-->>SYSLOG: Drop Packet (Prevent Log Flooding)
    else Device Authorized
        SYSLOG->>DB: INSERT INTO syslog & events tables
        SYSLOG->>ALERT: process_alert(hostname, message, timestamp)
        ALERT->>DB: Query enabled alert_rules
        ALERT->>ALERT: Evaluate Match & Exclude Filters
        alt Rule Matches Incident
            ALERT->>ALERT: Determine Status (ðŸ”´ Red for DOWN / ðŸŸ¢ Green for UP)
            ALERT->>DISCORD: Direct Dispatch: Discord Embed (#dc3545) / HTML Email / Telegram
            ALERT->>DB: INSERT INTO alert_log (sent status & errors)
        end
    end
    DASH->>DB: Polling /api/syslog/events (5s interval)
    DB-->>DASH: Return latest event records & update UI table
```

### 3.2. Diagnostic Health & In-App Power Management Pipeline
```mermaid
sequenceDiagram
    autonumber
    actor Admin as Admin User
    participant DASH as dashboard.html
    participant API as api.py (/api/system/*)
    participant PS as psutil / OS Process Manager
    participant LAUNCHER as launcher.pyw / START_NOC.bat

    %% Health Polling
    loop Continuous Diagnostic Loop (5s)
        DASH->>API: GET /api/system/health_detailed
        API->>PS: Collect Process CPU, RSS Memory, System CPU/RAM, Disk & Net I/O
        API->>API: Check Database, Service Heartbeats, Port Changes, Memory Thresholds
        API-->>DASH: Return JSON (Overall Status, Diagnostic Verdict, 5 Services, KPIs)
        DASH->>DASH: Update 5 KPI Cards, 4 Chart.js Charts, Diagnostic Banner
    end

    %% In-App Restart Trigger
    Admin->>DASH: Click "Restart Smart NOC" (Target: All)
    DASH->>API: POST /api/system/restart { "target": "all" }
    API-->>DASH: Return { success: true, reconnecting_in: 6 }
    DASH->>DASH: Display 6s Countdown Banner & Start Health Polling Loop
    API->>API: Spawn background thread _do_restart()
    API->>PS: Terminate daemons (trap, syslog, tftp)
    API->>LAUNCHER: Spawn launcher.pyw / START_NOC.bat
    API->>API: Exit process (os._exit(0))
    LAUNCHER->>LAUNCHER: Re-initialize all daemons & start fresh API server
    DASH->>API: GET /api/health (Polling until 200 OK)
    API-->>DASH: HTTP 200 OK (Reconnected)
    DASH->>DASH: Dismiss Banner & Resume Normal Real-Time Monitoring
```

---

## 4. Database Schema & Relational Structure

Smart NOC uses a pure PostgreSQL database schema with auto-indexing on high-frequency timestamp columns to maintain sub-second query latency under continuous multi-gigabyte log throughput.

```mermaid
erDiagram
    USERS ||--o{ NOC_SETTINGS : configures
    USERS {
        serial id PK
        text username UK
        text password
        text salt
        text email
        text role
        text visible_tabs
        text assigned_olts
        text assigned_ping_targets
        text notify_via
        text created_at
        text last_login
    }

    SYSLOG_DEVICES ||--o{ SYSLOG : sends
    SYSLOG_DEVICES {
        serial id PK
        text device_ip UK
        text hostname
        text olt_mac
        int authorized
        text created_at
    }

    SYSLOG {
        serial id PK
        text timestamp
        text host
        text facility
        text severity
        text tag
        text message
    }

    TRAPS {
        serial id PK
        text timestamp
        text source_ip
        text trap_oid
        text enterprise_oid
        text trap_type
        text raw_bindings
        text details
        text severity
    }

    ALERT_RULES ||--o{ ALERT_LOG : generates
    ALERT_RULES {
        serial id PK
        text name
        text host
        text exclude_hosts
        text contains_text
        text source_type
        text severity
        text notify_via
        text webhook_url
        text email_to
        text telegram_chat_id
        int enabled
        int cooldown_minutes
        text last_fired
    }

    ALERT_LOG {
        serial id PK
        text timestamp
        text rule_name
        text host
        text message
        text severity
        text channel
        text status
    }

    PING_TARGETS ||--o{ PING_RESULTS : records
    PING_TARGETS {
        serial id PK
        text name
        text ip UK
        text group_name
        int interval_sec
        int timeout_ms
        int enabled
        text status
        text last_seen
        float last_rtt
    }

    OLT_PROFILES ||--o{ ONU_DATA : discovers
    OLT_PROFILES ||--o{ OLT_POLL_JOBS : schedules
    OLT_PROFILES {
        serial id PK
        text name
        text ip UK
        text vendor
        text protocol
        int port
        text username
        text password
        text enable_password
        text snmp_community
        int enabled
    }

    TFTP_FILES {
        serial id PK
        text filename
        text filepath
        text client_ip
        bigint filesize
        text upload_time
        text checksum
    }
```

---

## 5. Security & Role-Based Access Control (RBAC)

1. **Authentication Engine**:
   - Password hashing via **PBKDF2-HMAC-SHA256** with 200,000 iterations and unique 16-byte random cryptographic salts.
   - Client session tokens stored in secure, HttpOnly, SameSite Flask session cookies with configurable inactivity timeouts (10, 30, 60 minutes).
2. **Role Separation**:
   - `admin`: Full unrestricted access to all 11 tabs, system power controls (Restart/Shutdown), port configuration, retention parameters, user provisioning, and OLT configuration write operations.
   - `viewer`: Read-only telemetry access scoped strictly to administrator-assigned tabs, assigned OLTs, and assigned ping targets. Write and deletion APIs return HTTP 403 Forbidden.
3. **Network Daemon Protection**:
   - Syslog Device Gatekeeper: Automatically drops packets originating from unauthorized or denied IP addresses, protecting the PostgreSQL database against log injection and flooding attacks.
   - TFTP Path Traversal Prevention: Strips malicious relative path syntax (`../`) to guarantee uploads are confined strictly to the `/backups/` directory.
4. **Transport Layer Security**:
   - Automatic TLS/SSL certificate resolver supporting HTTPS on configurable ports (default `5443`). Fallback self-signed certificates are generated via `gen_cert.py`.

---

## 6. Directory Layout & Storage Hierarchy

```text
e:\antigravity\
â”œâ”€â”€ api.py                    # Flask Web & REST API Core Backend
â”œâ”€â”€ launcher.pyw              # Supervisor GUI & Watchdog Process
â”œâ”€â”€ alert_engine.py           # Multi-Channel Alert & Rule Dispatcher
â”œâ”€â”€ syslog_server.py          # UDP 5141 Syslog Listener Daemon
â”œâ”€â”€ trap_receiver.py          # UDP 162 SNMP Trap Listener Daemon
â”œâ”€â”€ tftp_server.py            # UDP 69 TFTP Backup Storage Daemon
â”œâ”€â”€ olt_connector.py          # SSH/Telnet OLT & ONU Polling Engine
â”œâ”€â”€ vsol_mib.py               # Enterprise MIB OID Dictionary
â”œâ”€â”€ noc_config.py             # Central Application Settings & DB Pool
â”œâ”€â”€ gen_cert.py               # TLS/SSL Certificate Generator
â”œâ”€â”€ check_downtime.py         # Log & Uptime Gap Audit Tool
â”œâ”€â”€ setup.py                  # Installation & Maintenance Engine
â”œâ”€â”€ init_postgres.sql         # Base PostgreSQL Database DDL
â”œâ”€â”€ dashboard.html            # Single Page Web App (Frontend UI)
â”œâ”€â”€ login.html                # Secure Authentication Frontend
â”œâ”€â”€ README.md                 # Product Reference Documentation
â”œâ”€â”€ CHANGELOG.md              # Historical Release & Patch Log
â”œâ”€â”€ INSTALL.bat               # Windows Installation Bootstrap
â”œâ”€â”€ START_NOC.bat             # Production Service Startup Script
â”œâ”€â”€ STOP_NOC.bat              # Production Service Shutdown Script
â”œâ”€â”€ STATUS_NOC.bat            # Service Health Inspection Script
â”œâ”€â”€ run.bat                   # Setup & Diagnostics Interactive Menu
â”œâ”€â”€ clear_cache.bat           # Python Bytecode Cleanup Utility
â”œâ”€â”€ remove_tasks.bat          # Task Scheduler Maintenance Utility
â”œâ”€â”€ backups/                  # TFTP Uploads & Configuration Backups
â”œâ”€â”€ data/                     # Local Application Cache & SQLite DBs
â””â”€â”€ logs/                     # Daemon Heartbeats & Runtime Logs
    â”œâ”€â”€ API_and_Dashboard.log
    â”œâ”€â”€ SNMP_Trap_Receiver.log
    â”œâ”€â”€ Syslog_Server.log
    â””â”€â”€ TFTP_Server.log
```

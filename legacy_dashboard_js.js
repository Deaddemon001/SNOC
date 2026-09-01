
    var API = window.location.protocol + '//' + window.location.host;
    var barChart, lineChart, sysEventChart, sysSevChart, pingHistChart;
    var currentSysOlt = '';
    var currentUsername = '';
    var currentRole = '';
    var currentVisibleTabs = [];
    var globalVisibleTabs = getDefaultTabsForRole('viewer');
    var currentPortSettings = {};
    var editingUsername = '';

    var RETENTION_KEY_IDS = [
      'trap_retention_days',
      'syslog_retention_days',
      'ping_retention_days',
      'tftp_retention_days',
      'alert_log_retention_days',
      'olt_data_retention_days',
      'olt_session_retention_days'
    ];
    var PORT_KEY_IDS = ['api_port', 'https_port', 'snmp_port', 'syslog_port', 'tftp_port'];
    var USER_TAB_OPTIONS = [
      { id: 'dashboard', label: 'Dashboard' },
      { id: 'syslog', label: 'Syslog' },
      { id: 'snmp', label: 'SNMP Trap' },
      { id: 'tftp', label: 'TFTP Backups' },
      { id: 'ping', label: 'Ping Monitor' },
      { id: 'alerts', label: 'Alerts' },
      { id: 'olt', label: 'OLT Connect' },
      { id: 'uplink', label: 'Uplink Traffic' },
      { id: 'users', label: 'Users' },
      { id: 'logs', label: 'Logs' },
      { id: 'ont', label: 'ONT' }
    ];
    var SETTINGS_TAB_OPTIONS = USER_TAB_OPTIONS.filter(function (tab) {
      return tab.id !== 'users' && tab.id !== 'logs';
    });

    // â”€â”€ HELPERS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    function apiFetch(url, opts) {
      opts = opts || {};
      opts.credentials = 'include';
      
      var isLongRunning = url.indexOf('/api/olt/poll') !== -1 ||
                          url.indexOf('/api/olt/raw_output') !== -1 ||
                          url.indexOf('/api/olt/discover') !== -1 ||
                          url.indexOf('/api/olt/test_connection') !== -1 ||
                          url.indexOf('/api/backup/') !== -1 ||
                          url.indexOf('/api/system/service_action') !== -1;
      var timeoutMs = (opts.timeout !== undefined) ? opts.timeout : (isLongRunning ? 180000 : 30000);

      var controller = new AbortController();
      var timeoutId = null;
      if (timeoutMs > 0) {
        timeoutId = setTimeout(function() { controller.abort(); }, timeoutMs);
      }
      if (opts.signal) {
        opts.signal.addEventListener('abort', function() { controller.abort(); });
      }
      opts.signal = controller.signal;

      return fetch(API + url, opts).then(function (r) {
        if (timeoutId) clearTimeout(timeoutId);
        if (r.status === 401) { window.location.href = '/login'; throw new Error('401'); }
        if (!r.ok) {
          // Try to parse JSON error body first (preserves backend error messages)
          return r.json().then(function(errJson) {
            var errMsg = (errJson && errJson.error) ? errJson.error : ('HTTP ' + r.status + ' on ' + url);
            var errObj = new Error(errMsg);
            errObj.backendError = errMsg;
            throw errObj;
          }).catch(function(jsonErr) {
            if (jsonErr.backendError) throw jsonErr;
            throw new Error('HTTP ' + r.status + ' on ' + url);
          });
        }
        return r.json();
      }).catch(function(err) {
        if (timeoutId) clearTimeout(timeoutId);
        throw err;
      });
    }

    function apiPost(url, body) {
      return apiFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
    }

    function showMsg(id, msg, ok, persist, loading) {
      var el = document.getElementById(id);
      if (!el) return;
      if (loading) {
        el.innerHTML = '<span class="status-spinner"></span> <span>' + msg + '</span>';
      } else {
        el.textContent = msg;
      }
      el.style.display = 'flex';
      el.style.alignItems = 'center';
      el.style.gap = '8px';
      el.style.background = ok ? 'rgba(57,255,20,0.08)' : 'rgba(255,45,85,0.08)';
      el.style.border = '1px solid ' + (ok ? 'rgba(57,255,20,0.3)' : 'rgba(255,45,85,0.3)');
      el.style.color = ok ? 'var(--accent3)' : 'var(--danger)';
      if (!persist) {
        setTimeout(function () { el.style.display = 'none'; }, 5000);
      }
    }

    function roleLabel(role) {
      return role === 'admin' ? 'ADMIN' : 'READ-ONLY';
    }

    function roleOptionLabel(role) {
      return role === 'admin' ? 'Admin (full access)' : 'Read-only';
    }

    function getDefaultTabsForRole(role) {
      if (role === 'admin') {
        return ['dashboard', 'syslog', 'snmp', 'tftp', 'ping', 'alerts', 'olt', 'uplink', 'logs', 'ont', 'users'];
      }
      return ['dashboard', 'syslog', 'snmp', 'tftp', 'ping', 'alerts', 'olt', 'uplink', 'ont'];
    }

    function setTftpPortLabels(port) {
      var value = String(port || 69);
      ['tftpPortValue', 'tftpPortHint', 'tftpPortEmpty'].forEach(function (id) {
        var el = document.getElementById(id);
        if (!el) return;
        el.textContent = value;
      });
    }

    function renderUserTabCheckboxes(containerId) {
      var box = document.getElementById(containerId);
      if (!box) return;
      var html = '';
      USER_TAB_OPTIONS.forEach(function (tab) {
        html += '<label style="display:flex;gap:8px;align-items:center"><input type="checkbox" value="' + tab.id + '" /> ' + tab.label + '</label>';
      });
      box.innerHTML = html;
    }

    function renderSettingsTabCheckboxes() {
      var box = document.getElementById('settingsVisibleTabs');
      if (!box) return;
      var html = '';
      SETTINGS_TAB_OPTIONS.forEach(function (tab) {
        html += '<label style="display:flex;gap:8px;align-items:center"><input type="checkbox" value="' + tab.id + '" /> ' + tab.label + '</label>';
      });
      box.innerHTML = html;
    }

    function setUserTabSelections(containerId, tabs) {
      if (!Array.isArray(tabs) || !tabs.length) tabs = getDefaultTabsForRole('viewer');
      var box = document.getElementById(containerId);
      if (!box) return;
      box.querySelectorAll('input[type="checkbox"]').forEach(function (cb) {
        cb.checked = tabs.indexOf(cb.value) !== -1;
      });
    }

    function getUserTabSelections(containerId, role) {
      if (role === 'admin') {
        return getDefaultTabsForRole('admin');
      }
      var box = document.getElementById(containerId);
      var tabs = [];
      if (box) {
        box.querySelectorAll('input[type="checkbox"]').forEach(function (cb) {
          if (cb.checked) tabs.push(cb.value);
        });
      }
      tabs = tabs.filter(function (tab) {
        return globalVisibleTabs.indexOf(tab) !== -1;
      });
      if (!tabs.length) tabs = getDefaultTabsForRole(role);
      return tabs;
    }

    function setSettingsTabSelections(tabs) {
      var box = document.getElementById('settingsVisibleTabs');
      if (!box) return;
      box.querySelectorAll('input[type="checkbox"]').forEach(function (cb) {
        cb.checked = tabs.indexOf(cb.value) !== -1;
      });
    }

    function getSettingsTabSelections() {
      var box = document.getElementById('settingsVisibleTabs');
      var tabs = [];
      if (!box) return tabs;
      box.querySelectorAll('input[type="checkbox"]').forEach(function (cb) {
        if (cb.checked) tabs.push(cb.value);
      });
      if (!tabs.length) tabs = getDefaultTabsForRole('viewer');
      return tabs;
    }

    function syncUserTabAvailability(containerId, role) {
      var box = document.getElementById(containerId);
      if (!box) return;
      box.querySelectorAll('input[type="checkbox"]').forEach(function (cb) {
        var alwaysAllowed = role === 'admin' && (cb.value === 'users' || cb.value === 'logs');
        var enabled = alwaysAllowed || globalVisibleTabs.indexOf(cb.value) !== -1;
        cb.disabled = !enabled;
        if (!enabled) cb.checked = false;
      });
    }

    // â”€â”€ DASHBOARD HEALTH & POWER CONTROLS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    var dashResourceChart = null;
    var dashMemoryChart = null;
    var dashStorageChart = null;
    var dashNetworkChart = null;
    var _lastHealthData = null;
    var _reconnectTimer = null;
    var _isRestarting = false;

    function initDashboardCharts() {
      var ct = getChartTheme();

      // 1. Resource Timeline Chart (CPU % & RAM MB)
      var resEl = document.getElementById('dashResourceChart');
      if (resEl) {
        dashResourceChart = new Chart(resEl, {
          type: 'line',
          data: {
            labels: [],
            datasets: [
              {
                label: 'App CPU (%)',
                data: [],
                borderColor: '#00e5ff',
                backgroundColor: 'rgba(0, 229, 255, 0.08)',
                borderWidth: 2,
                pointRadius: 2,
                tension: 0.35,
                fill: true,
                yAxisID: 'y'
              },
              {
                label: 'App Memory (MB)',
                data: [],
                borderColor: '#ff6b35',
                backgroundColor: 'rgba(255, 107, 53, 0.08)',
                borderWidth: 2,
                pointRadius: 2,
                tension: 0.35,
                fill: true,
                yAxisID: 'y1'
              }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            plugins: {
              legend: {
                display: true,
                labels: { color: ct.legend, font: { size: 10, family: 'Share Tech Mono' }, boxWidth: 12 }
              }
            },
            scales: {
              x: {
                grid: { color: ct.grid },
                ticks: { color: ct.tick, maxTicksLimit: 8, font: { size: 10, family: 'Share Tech Mono' } }
              },
              y: {
                type: 'linear',
                display: true,
                position: 'left',
                grid: { color: ct.grid },
                ticks: { color: '#00e5ff', font: { size: 10, family: 'Share Tech Mono' }, callback: function(v) { return v + '%'; } },
                beginAtZero: true,
                max: 100
              },
              y1: {
                type: 'linear',
                display: true,
                position: 'right',
                grid: { drawOnChartArea: false },
                ticks: { color: '#ff6b35', font: { size: 10, family: 'Share Tech Mono' }, callback: function(v) { return v + ' MB'; } },
                beginAtZero: true
              }
            }
          }
        });
      }

      // 2. Memory Utilization Doughnut Chart
      var memEl = document.getElementById('dashMemoryChart');
      if (memEl) {
        dashMemoryChart = new Chart(memEl, {
          type: 'doughnut',
          data: {
            labels: ['SimpleNOC App', 'Other Processes', 'Free Memory'],
            datasets: [{
              data: [1, 1, 1],
              backgroundColor: ['#00e5ff', '#ff6b35', '#39ff14'],
              borderWidth: 1,
              borderColor: '#0a1520'
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            cutout: '62%',
            plugins: {
              legend: {
                position: 'right',
                labels: { color: ct.tick, font: { size: 10, family: 'Share Tech Mono' }, boxWidth: 12 }
              }
            }
          }
        });
      }

      // 3. Storage Distribution Doughnut/Pie Chart
      var storEl = document.getElementById('dashStorageChart');
      if (storEl) {
        dashStorageChart = new Chart(storEl, {
          type: 'doughnut',
          data: {
            labels: ['Postgres Database', 'TFTP Backups', 'Log Files', 'Data/SSL', 'Free Disk Space'],
            datasets: [{
              data: [1, 1, 1, 1, 1],
              backgroundColor: ['#00e5ff', '#39ff14', '#ffd60a', '#a855f7', '#0070ba'],
              borderWidth: 1,
              borderColor: '#0a1520'
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            cutout: '55%',
            plugins: {
              legend: {
                position: 'right',
                labels: { color: ct.tick, font: { size: 10, family: 'Share Tech Mono' }, boxWidth: 12 }
              }
            }
          }
        });
      }

      // 4. Network Throughput Rate Chart
      var netEl = document.getElementById('dashNetworkChart');
      if (netEl) {
        dashNetworkChart = new Chart(netEl, {
          type: 'line',
          data: {
            labels: [],
            datasets: [
              {
                label: 'Inbound RX (KB/s)',
                data: [],
                borderColor: '#39ff14',
                backgroundColor: 'rgba(57, 255, 20, 0.08)',
                borderWidth: 1.5,
                pointRadius: 2,
                tension: 0.3,
                fill: true
              },
              {
                label: 'Outbound TX (KB/s)',
                data: [],
                borderColor: '#00e5ff',
                backgroundColor: 'rgba(0, 229, 255, 0.08)',
                borderWidth: 1.5,
                pointRadius: 2,
                tension: 0.3,
                fill: true
              }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            plugins: {
              legend: {
                display: true,
                labels: { color: ct.legend, font: { size: 10, family: 'Share Tech Mono' }, boxWidth: 12 }
              }
            },
            scales: {
              x: {
                grid: { color: ct.grid },
                ticks: { color: ct.tick, maxTicksLimit: 8, font: { size: 10, family: 'Share Tech Mono' } }
              },
              y: {
                grid: { color: ct.grid },
                ticks: { color: ct.tick, font: { size: 10, family: 'Share Tech Mono' }, callback: function(v) { return v + ' KB/s'; } },
                beginAtZero: true
              }
            }
          }
        });
      }
    }

    function applyDashboardChartsTheme() {
      var th = getChartTheme();
      if (dashResourceChart && dashResourceChart.options) {
        if (dashResourceChart.options.plugins && dashResourceChart.options.plugins.legend) {
          dashResourceChart.options.plugins.legend.labels.color = th.legend;
        }
        if (dashResourceChart.options.scales) {
          if (dashResourceChart.options.scales.x) {
            dashResourceChart.options.scales.x.grid.color = th.grid;
            dashResourceChart.options.scales.x.ticks.color = th.tick;
          }
          if (dashResourceChart.options.scales.y) dashResourceChart.options.scales.y.grid.color = th.grid;
        }
        dashResourceChart.update('none');
      }
      if (dashMemoryChart && dashMemoryChart.options && dashMemoryChart.options.plugins && dashMemoryChart.options.plugins.legend) {
        dashMemoryChart.options.plugins.legend.labels.color = th.legend;
        dashMemoryChart.update('none');
      }
      if (dashStorageChart && dashStorageChart.options && dashStorageChart.options.plugins && dashStorageChart.options.plugins.legend) {
        dashStorageChart.options.plugins.legend.labels.color = th.legend;
        dashStorageChart.update('none');
      }
      if (dashNetworkChart && dashNetworkChart.options) {
        if (dashNetworkChart.options.plugins && dashNetworkChart.options.plugins.legend) {
          dashNetworkChart.options.plugins.legend.labels.color = th.legend;
        }
        if (dashNetworkChart.options.scales) {
          if (dashNetworkChart.options.scales.x) {
            dashNetworkChart.options.scales.x.grid.color = th.grid;
            dashNetworkChart.options.scales.x.ticks.color = th.tick;
          }
          if (dashNetworkChart.options.scales.y) {
            dashNetworkChart.options.scales.y.grid.color = th.grid;
            dashNetworkChart.options.scales.y.ticks.color = th.tick;
          }
        }
        dashNetworkChart.update('none');
      }
    }

    function refreshDashboardHealth() {
      if (_isRestarting) return;
      apiFetch('/api/system/health_detailed').then(function(d) {
        _lastHealthData = d;
        renderDashboardHealth(d);
      }).catch(function(e) {
        console.warn('Dashboard health poll error:', e);
      });
    }

    function renderDashboardHealth(d) {
      if (!d) return;

      // 1. Diagnostic Banner
      var banner = document.getElementById('dashDiagBanner');
      var badge = document.getElementById('dashDiagBadge');
      var title = document.getElementById('dashDiagTitle');
      var verdict = document.getElementById('dashDiagVerdict');
      var hostInfo = document.getElementById('dashHostInfo');

      var status = (d.overall_status || 'optimal').toLowerCase();
      var badgeClass = status === 'optimal' ? 'optimal' : status === 'warning' ? 'warning' : 'critical';
      var badgeText = status === 'optimal' ? 'ðŸŸ¢ OPTIMAL HEALTH' : status === 'warning' ? 'ðŸŸ¡ ATTENTION REQUIRED' : 'ðŸ”´ ACTION REQUIRED';

      if (banner) {
        banner.className = 'dash-diag-banner ' + badgeClass;
      }
      if (badge) {
        badge.className = 'dash-diag-badge ' + badgeClass;
        badge.textContent = badgeText;
      }
      if (hostInfo && d.system) {
        hostInfo.textContent = 'Host: ' + (d.system.hostname || 'Local') + ' (' + (d.system.os || 'Windows') + ') â€¢ Python ' + (d.process ? d.process.python_version : '3.x') + ' â€¢ ' + (d.system.cpu_count || 4) + ' Cores';
      }
      if (verdict && d.diagnostic) {
        verdict.innerHTML = '<strong>' + (d.diagnostic.headline || '') + '</strong> â€” ' + (d.diagnostic.verdict || '');
      }

      // 2. 5 KPI Cards
      var appCpu = (d.process && d.process.cpu_percent !== undefined) ? d.process.cpu_percent : 0;
      var sysCpu = (d.system && d.system.cpu_percent !== undefined) ? d.system.cpu_percent : 0;
      var appRamMb = (d.process && d.process.memory_rss_mb !== undefined) ? d.process.memory_rss_mb : 0;
      var sysRamPct = (d.system && d.system.memory_percent !== undefined) ? d.system.memory_percent : 0;
      var sysRamUsedMb = (d.system && d.system.memory_used_mb !== undefined) ? d.system.memory_used_mb : 0;
      var sysRamTotalMb = (d.system && d.system.memory_total_mb !== undefined) ? d.system.memory_total_mb : 1;

      var diskFreeGb = (d.disk && d.disk.drive_free_gb !== undefined) ? d.disk.drive_free_gb : 0;
      var appStorageMb = (d.disk && d.disk.app_total_mb !== undefined) ? d.disk.app_total_mb : 0;
      var diskFreePct = (d.disk && d.disk.drive_percent_free !== undefined) ? d.disk.drive_percent_free : 0;

      var netInRate = (d.network && d.network.net_in_rate_kb !== undefined) ? d.network.net_in_rate_kb : 0;
      var netOutRate = (d.network && d.network.net_out_rate_kb !== undefined) ? d.network.net_out_rate_kb : 0;
      var totalNetRate = (netInRate + netOutRate).toFixed(1);

      var uptimeFmt = (d.uptime && d.uptime.formatted) ? d.uptime.formatted : '0m';
      var pid = (d.process && d.process.pid) ? d.process.pid : 'â€”';
      var threads = (d.process && d.process.threads_count) ? d.process.threads_count : 0;

      // Update KPI DOM
      var elAppCpu = document.getElementById('dashKpiAppCpu');
      var elSysCpu = document.getElementById('dashKpiSysCpu');
      var barCpu = document.getElementById('dashBarCpu');
      if (elAppCpu) elAppCpu.textContent = appCpu.toFixed(1) + '%';
      if (elSysCpu) elSysCpu.textContent = 'System: ' + sysCpu.toFixed(1) + '%';
      if (barCpu) barCpu.style.width = Math.min(100, Math.max(2, appCpu)) + '%';

      var elAppRam = document.getElementById('dashKpiAppRam');
      var elSysRam = document.getElementById('dashKpiSysRam');
      var barRam = document.getElementById('dashBarRam');
      if (elAppRam) elAppRam.textContent = appRamMb.toFixed(1) + ' MB';
      if (elSysRam) elSysRam.textContent = 'System: ' + sysRamPct.toFixed(0) + '% (' + (sysRamUsedMb / 1024).toFixed(1) + ' GB)';
      if (barRam) barRam.style.width = Math.min(100, Math.max(2, (appRamMb / sysRamTotalMb) * 100)) + '%';

      var elDiskFree = document.getElementById('dashKpiDiskFree');
      var elAppStorage = document.getElementById('dashKpiAppStorage');
      var barDisk = document.getElementById('dashBarDisk');
      if (elDiskFree) elDiskFree.textContent = diskFreeGb.toFixed(1) + ' GB Free';
      if (elAppStorage) elAppStorage.textContent = 'App Storage: ' + appStorageMb.toFixed(1) + ' MB';
      if (barDisk) barDisk.style.width = Math.min(100, Math.max(2, diskFreePct)) + '%';

      var elNetThroughput = document.getElementById('dashKpiNetThroughput');
      var elNetIn = document.getElementById('dashKpiNetIn');
      var elNetOut = document.getElementById('dashKpiNetOut');
      if (elNetThroughput) elNetThroughput.textContent = totalNetRate + ' KB/s';
      if (elNetIn) elNetIn.textContent = 'RX: ' + netInRate.toFixed(1) + ' KB/s';
      if (elNetOut) elNetOut.textContent = 'TX: ' + netOutRate.toFixed(1) + ' KB/s';

      var elUptime = document.getElementById('dashKpiUptime');
      var elThreads = document.getElementById('dashKpiThreads');
      var elPid = document.getElementById('dashKpiPid');
      if (elUptime) elUptime.textContent = uptimeFmt;
      if (elThreads) elThreads.textContent = 'Threads: ' + threads;
      if (elPid) elPid.textContent = 'PID: ' + pid;

      // 3. Update Charts
      if (dashResourceChart && d.metrics_history && d.metrics_history.length) {
        var labels = d.metrics_history.map(function(s) { return s.time; });
        var cpuData = d.metrics_history.map(function(s) { return s.app_cpu; });
        var ramData = d.metrics_history.map(function(s) { return s.app_ram_mb; });
        dashResourceChart.data.labels = labels;
        dashResourceChart.data.datasets[0].data = cpuData;
        dashResourceChart.data.datasets[1].data = ramData;
        dashResourceChart.update('none');
      }

      if (dashMemoryChart && d.system) {
        var appRss = appRamMb;
        var totalUsed = sysRamUsedMb;
        var otherUsed = Math.max(0, totalUsed - appRss);
        var freeMem = Math.max(0, (d.system.memory_available_mb || 0));
        dashMemoryChart.data.datasets[0].data = [
          Math.round(appRss),
          Math.round(otherUsed),
          Math.round(freeMem)
        ];
        dashMemoryChart.update('none');
      }

      if (dashStorageChart && d.disk) {
        var dbMb = d.disk.postgres_db_mb || 0;
        var backupsMb = d.disk.backups_size_mb || 0;
        var logsMb = d.disk.logs_size_mb || 0;
        var dataMb = d.disk.data_size_mb || 0;
        var freeMb = Math.round((d.disk.drive_free_gb || 0) * 1024);
        dashStorageChart.data.datasets[0].data = [
          dbMb,
          backupsMb,
          logsMb,
          dataMb,
          freeMb
        ];
        dashStorageChart.update('none');
      }

      if (dashNetworkChart && d.metrics_history && d.metrics_history.length) {
        var netLabels = d.metrics_history.map(function(s) { return s.time; });
        var inData = d.metrics_history.map(function(s) { return s.net_in_rate; });
        var outData = d.metrics_history.map(function(s) { return s.net_out_rate; });
        dashNetworkChart.data.labels = netLabels;
        dashNetworkChart.data.datasets[0].data = inData;
        dashNetworkChart.data.datasets[1].data = outData;
        dashNetworkChart.update('none');
      }

      // 4. Update Services Status Matrix
      var tbody = document.getElementById('dashServicesTableBody');
      if (tbody && d.services) {
        var html = '';
        var activeCount = 0;
        var totalServices = Object.keys(d.services).length;

        Object.keys(d.services).forEach(function(key) {
          var svc = d.services[key];
          if (svc.running) activeCount++;
          var stBadge = svc.running
            ? '<span class="b bg" style="font-size:10px">HEALTHY</span>'
            : '<span class="b br" style="font-size:10px">STOPPED</span>';
          
          var memStr = (svc.memory_rss_mb && svc.memory_rss_mb > 0) ? (svc.memory_rss_mb.toFixed(1) + ' MB') : 'â€”';
          var cpuStr = (svc.cpu_percent !== undefined && svc.running) ? (svc.cpu_percent.toFixed(1) + '%') : 'â€”';
          var pidStr = (svc.pids && svc.pids.length) ? svc.pids.join(', ') : 'â€”';
          var uptimeStr = svc.uptime_formatted || (svc.running ? 'Active' : 'â€”');
          var hbStr = svc.last_heartbeat_ago || 'â€”';

          var actionBtn = '';
          if (key === 'postgres') {
            actionBtn = '<span style="font-size:10px;color:var(--muted)">System DB</span>';
          } else {
            actionBtn = '<button class="btn-service-restart" onclick="restartIndividualService(\'' + key + '\')">&#8635; Restart</button>';
          }

          html += '<tr>' +
            '<td><strong>' + (svc.name || key) + '</strong></td>' +
            '<td class="mu">' + (svc.script || 'Service') + ' â€¢ ' + (svc.protocol || '') + '</td>' +
            '<td style="font-family:monospace;color:var(--accent)">' + (svc.port || 'â€”') + '</td>' +
            '<td>' + stBadge + '</td>' +
            '<td class="mu">' + pidStr + '</td>' +
            '<td style="text-align:right;font-family:monospace;color:var(--text)">' + memStr + '</td>' +
            '<td style="text-align:right;font-family:monospace;color:var(--accent3)">' + cpuStr + '</td>' +
            '<td class="mu">' + uptimeStr + '</td>' +
            '<td class="mu" style="font-size:11px">' + hbStr + '</td>' +
            '<td style="text-align:center">' + actionBtn + '</td>' +
            '</tr>';
        });

        tbody.innerHTML = html;
        var summaryEl = document.getElementById('dashServiceSummary');
        if (summaryEl) {
          summaryEl.textContent = activeCount + ' / ' + totalServices + ' Services Running';
          summaryEl.style.color = (activeCount === totalServices) ? 'var(--accent3)' : 'var(--warn)';
        }
      }

      // 5. Quick Inventory Counts
      if (d.counts) {
        var elTraps = document.getElementById('dashCntTraps');
        var elSyslog = document.getElementById('dashCntSyslog');
        var elPing = document.getElementById('dashCntPing');
        var elTftp = document.getElementById('dashCntTftp');
        var elOlt = document.getElementById('dashCntOlt');
        var elAlerts = document.getElementById('dashCntAlerts');

        if (elTraps) elTraps.textContent = (d.counts.traps !== undefined) ? d.counts.traps.toLocaleString() : 'â€”';
        if (elSyslog) elSyslog.textContent = (d.counts.syslog !== undefined) ? d.counts.syslog.toLocaleString() : 'â€”';
        if (elPing) elPing.textContent = (d.counts.ping_targets !== undefined) ? d.counts.ping_targets.toLocaleString() : 'â€”';
        if (elTftp) elTftp.textContent = (d.counts.tftp_backups !== undefined) ? d.counts.tftp_backups.toLocaleString() : 'â€”';
        if (elOlt) elOlt.textContent = (d.counts.olt_profiles !== undefined) ? d.counts.olt_profiles.toLocaleString() : 'â€”';
        if (elAlerts) elAlerts.textContent = (d.counts.alert_rules !== undefined) ? d.counts.alert_rules.toLocaleString() : 'â€”';
      }
    }

    // â”€â”€ APPLICATION LIFECYCLE CONTROLS (RESTART / SHUTDOWN) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    function openConfirmRestart(target) {
      if (currentRole !== 'admin') {
        alert('Administrator privilege is required to restart SimpleNOC services.');
        return;
      }
      var sel = document.getElementById('confirmRestartTarget');
      if (sel) sel.value = target || 'all';
      var msg = document.getElementById('confirmRestartMsg');
      if (msg) msg.style.display = 'none';
      var modal = document.getElementById('confirmRestartModal');
      if (modal) modal.classList.add('show');
    }

    function executeRestartFromModal() {
      var sel = document.getElementById('confirmRestartTarget');
      var target = sel ? sel.value : 'all';
      var modal = document.getElementById('confirmRestartModal');
      if (modal) modal.classList.remove('show');

      apiPost('/api/system/restart', { target: target }).then(function(r) {
        if (r.success) {
          if (target === 'all' || target === 'api') {
            startReconnectionCountdown(r.reconnecting_in || 6, 'Restarting SimpleNOC...');
          } else {
            showMsg('settingsModalMsg', 'Service restarted successfully: ' + (r.message || target), true);
            refreshDashboardHealth();
          }
        } else {
          alert('Restart failed: ' + (r.error || 'Unknown error'));
        }
      }).catch(function(e) {
        if (target === 'all' || target === 'api') {
          startReconnectionCountdown(6, 'Restarting SimpleNOC...');
        } else {
          alert('Restart request error: ' + e.message);
        }
      });
    }

    function restartIndividualService(svc) {
      if (currentRole !== 'admin') {
        alert('Administrator privilege is required to restart services.');
        return;
      }
      if (!confirm('Restart service "' + svc.toUpperCase() + '"?')) return;
      if (svc === 'api' || svc === 'all') {
        openConfirmRestart(svc);
        return;
      }
      apiPost('/api/system/service_action', { action: 'restart', service: svc }).then(function(r) {
        if (r.success) {
          refreshDashboardHealth();
        } else {
          alert('Failed to restart ' + svc + ': ' + (r.error || 'Unknown error'));
        }
      }).catch(function(e) {
        alert('Error: ' + e.message);
      });
    }

    function openConfirmShutdown() {
      if (currentRole !== 'admin') {
        alert('Administrator privilege is required to shutdown SimpleNOC.');
        return;
      }
      var msg = document.getElementById('confirmShutdownMsg');
      if (msg) msg.style.display = 'none';
      var modal = document.getElementById('confirmShutdownModal');
      if (modal) modal.classList.add('show');
    }

    function executeShutdownFromModal() {
      var modal = document.getElementById('confirmShutdownModal');
      if (modal) modal.classList.remove('show');

      apiPost('/api/system/shutdown', {}).then(function(r) {
        _isRestarting = true;
        var pModal = document.getElementById('reconnectProgressModal');
        var pTitle = document.getElementById('reconnectTitle');
        var pSub = document.getElementById('reconnectSub');
        var pCd = document.getElementById('reconnectCountdown');
        if (pModal) pModal.classList.add('show');
        if (pTitle) { pTitle.textContent = 'SimpleNOC Stopped'; pTitle.style.color = 'var(--danger)'; }
        if (pSub) pSub.textContent = 'All SimpleNOC services have been stopped. To restart, launch launcher.pyw or START_NOC.bat on the host PC.';
        if (pCd) pCd.textContent = 'OFFLINE';
      }).catch(function(e) {
        alert('Shutdown request error: ' + e.message);
      });
    }

    function startReconnectionCountdown(totalSec, msg) {
      _isRestarting = true;
      var modal = document.getElementById('reconnectProgressModal');
      var title = document.getElementById('reconnectTitle');
      var sub = document.getElementById('reconnectSub');
      var cd = document.getElementById('reconnectCountdown');
      var bar = document.getElementById('reconnectBar');

      if (modal) modal.classList.add('show');
      if (title) title.textContent = 'Restarting SimpleNOC';
      if (sub) sub.textContent = msg || 'Restarting services and verifying stack health...';

      var remaining = Math.max(3, totalSec || 6);
      if (cd) cd.textContent = remaining + 's';
      if (bar) bar.style.width = '100%';

      if (_reconnectTimer) clearInterval(_reconnectTimer);

      _reconnectTimer = setInterval(function() {
        remaining--;
        if (cd) cd.textContent = Math.max(0, remaining) + 's';
        if (bar) bar.style.width = Math.max(0, (remaining / (totalSec || 6)) * 100) + '%';

        if (remaining <= 0) {
          if (cd) cd.textContent = 'Reconnecting...';
          // Try pinging /api/health
          fetch(API + '/api/health', { method: 'GET', cache: 'no-store' }).then(function(res) {
            if (res.ok) {
              clearInterval(_reconnectTimer);
              _reconnectTimer = null;
              if (cd) cd.textContent = 'Online!';
              setTimeout(function() {
                window.location.reload();
              }, 500);
            }
          }).catch(function() {
            // Still starting up, keep polling every 1s
          });
        }
      }, 1000);
    }

    // â”€â”€ TABS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    function switchTab(t) {
      // Use data-tab attribute â€” works correctly regardless of drag order
      document.querySelectorAll('.tab').forEach(function (el) {
        el.classList.toggle('active', el.dataset.tab === t);
      });
      document.querySelectorAll('.tc').forEach(function (el) { el.classList.remove('active'); });
      var el = document.getElementById('tab-' + t);
      if (el) el.classList.add('active');
      if (t === 'dashboard') refreshDashboardHealth();
      if (t === 'users') { loadUsers(); loadAvailableTargets(); }
      if (t === 'alerts') loadAlerts();
      if (t === 'tftp') { loadTftp(); loadMacMapping(); }
      if (t === 'olt' || t === 'uplink') loadOlt();
      if (t === 'logs') loadLogsTab();
      if (t === 'ont') { /* no auto fetch */ }
    }

    function refreshDashboard() {
      refreshDashboardHealth();
      fetchAll();
      fetchPing();
      var active = document.querySelector('.tab.active');
      var t = active && active.dataset ? active.dataset.tab : null;
      if (t === 'dashboard') refreshDashboardHealth();
      else if (t === 'alerts') loadAlerts();
      else if (t === 'tftp') { loadTftp(); loadMacMapping(); }
      else if (t === 'olt' || t === 'uplink') loadOlt();
      else if (t === 'users') { loadUsers(); loadAvailableTargets(); }
      else if (t === 'logs') loadLogsTab();
      else if (t === 'ont') { /* keep last results */ }
    }

    // â”€â”€ SYSLOG EVENTS PAGINATION â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    var _sysEvtOffset = 0;
    var _sysEvtLimit = 50;
    function loadSysEventsPage(offset) {
      _sysEvtOffset = Math.max(0, offset || 0);
      var sysQ = currentSysOlt ? ('&olt_hostname=' + encodeURIComponent(currentSysOlt)) : '';
      var url = '/api/syslog/events?limit=' + encodeURIComponent(_sysEvtLimit) + '&offset=' + encodeURIComponent(_sysEvtOffset) + sysQ;
      apiFetch(url).then(function (events) {
        events = events || [];
        var setTb = document.getElementById('sysEvtTable');
        if (!events.length) {
          setTb.innerHTML = '<tr><td colspan="7"><div class="empty">No events on this page.</div></td></tr>';
        } else {
          buildEventsTable(setTb, events);
        }
        var page = Math.floor(_sysEvtOffset / _sysEvtLimit) + 1;
        var pEl = document.getElementById('sysEvtPage');
        if (pEl) pEl.textContent = 'Page ' + page;
        var prevBtn = document.getElementById('sysEvtPrevBtn');
        var nextBtn = document.getElementById('sysEvtNextBtn');
        if (prevBtn) prevBtn.disabled = _sysEvtOffset === 0;
        if (nextBtn) nextBtn.disabled = events.length < _sysEvtLimit;
      }).catch(function () { /* ignore */ });
    }

    function sysEvtNext() {
      loadSysEventsPage(_sysEvtOffset + _sysEvtLimit);
    }

    function sysEvtPrev() {
      loadSysEventsPage(Math.max(0, _sysEvtOffset - _sysEvtLimit));
    }

    // â”€â”€ LOGS TAB â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    var _logsCache = { name: '', lines: [] };
    function loadLogsTab() {
      apiFetch('/api/logs/list').then(function (items) {
        var sel = document.getElementById('logsFileSel');
        if (!sel) return;
        var prev = sel.value;
        sel.innerHTML = '<option value="">â€” select log â€”</option>';
        (items || []).forEach(function (it) {
          var opt = document.createElement('option');
          opt.value = it.name;
          opt.textContent = it.name;
          if (it.name === prev) opt.selected = true;
          sel.appendChild(opt);
        });
        if (prev) loadSelectedLog();
      }).catch(function (e) {
        showMsg('logsMsg', e.message || 'Failed to load logs list', false, true);
      });
    }

    function refreshLogs() {
      loadLogsTab();
      loadSelectedLog();
    }

    function loadSelectedLog() {
      var sel = document.getElementById('logsFileSel');
      var tailSel = document.getElementById('logsTailSel');
      var name = sel ? sel.value : '';
      var tail = tailSel ? parseInt(tailSel.value, 10) : 500;
      if (!name) return;
      apiFetch('/api/logs/read?name=' + encodeURIComponent(name) + '&tail=' + encodeURIComponent(tail)).then(function (r) {
        _logsCache.name = name;
        _logsCache.lines = (r && r.lines) ? r.lines : [];
        var meta = r && r.meta ? r.meta : {};
        var m = document.getElementById('logsMeta');
        if (m) {
          var dt = meta.mtime ? new Date(meta.mtime).toLocaleString() : 'â€”';
          var sz = (meta.size !== undefined) ? (Math.round(meta.size / 1024) + ' KB') : 'â€”';
          m.textContent = (meta.name || name) + ' â€¢ ' + dt + ' â€¢ ' + sz;
        }
        filterLogsView();
      }).catch(function (e) {
        showMsg('logsMsg', e.message || 'Failed to read log', false, true);
      });
    }

    function filterLogsView() {
      var pre = document.getElementById('logsPre');
      if (!pre) return;
      var q = (document.getElementById('logsSearch').value || '').toLowerCase();
      var lines = _logsCache.lines || [];
      if (!lines.length) {
        pre.textContent = '(no log lines loaded)';
        return;
      }
      if (!q) {
        pre.textContent = lines.join('\n');
        return;
      }
      var filtered = lines.filter(function (ln) { return (ln || '').toLowerCase().indexOf(q) !== -1; });
      pre.textContent = filtered.join('\n') || '(no matches)';
    }

    // â”€â”€ ONT TAB â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    var _ontChart = null;
    function ontClear() {
      document.getElementById('ontSerialInp').value = '';
      document.getElementById('ontMeta').textContent = 'Search by ONT serial number (uses stored polled history)';
      document.getElementById('ontChartMeta').textContent = 'â€”';
      document.getElementById('ontCount').textContent = '0 records';
      document.getElementById('ontTable').innerHTML =
        '<tr><td colspan="8"><div class="empty">Enter a serial number and click Search.</div></td></tr>';
      if (_ontChart) { _ontChart.destroy(); _ontChart = null; }
      showMsg('ontMsg', '', true, true);
      var el = document.getElementById('ontMsg');
      if (el) el.style.display = 'none';
    }

    function ontSearch() {
      var sn = (document.getElementById('ontSerialInp').value || '').trim();
      if (!sn) return showMsg('ontMsg', 'Serial number is required.', false, true);
      document.getElementById('ontMeta').textContent = 'Serial: ' + sn;
      showMsg('ontMsg', 'Searching history...', true, true);
      apiFetch('/api/onu/history?serial_no=' + encodeURIComponent(sn)).then(function (rows) {
        rows = rows || [];
        document.getElementById('ontCount').textContent = rows.length + ' records';
        if (!rows.length) {
          document.getElementById('ontTable').innerHTML =
            '<tr><td colspan="8"><div class="empty">No history found. Poll the OLT first so SNOC can store snapshots.</div></td></tr>';
          document.getElementById('ontChartMeta').textContent = 'No samples';
          if (_ontChart) { _ontChart.destroy(); _ontChart = null; }
          showMsg('ontMsg', 'No history found.', false, true);
          return;
        }
        showMsg('ontMsg', 'Loaded ' + rows.length + ' snapshots.', true, true);
        buildOntTable(rows);
        renderOntRxChart(rows);
      }).catch(function (e) {
        if (e.message === '401') return;
        showMsg('ontMsg', e.message || 'Search failed', false, true);
      });
    }

    function buildOntTable(rows) {
      var tb = document.getElementById('ontTable');
      tb.innerHTML = '';
      rows.forEach(function (r) {
        var tr = document.createElement('tr');
        var dt = r.poll_time ? new Date(r.poll_time) : null;
        var status = (r.online ? 'Online' : 'Offline');
        var stClr = r.online ? 'var(--accent3)' : 'var(--danger)';
        var rx = (r.rx_power === null || r.rx_power === undefined) ? 'â€”' : (Number(r.rx_power).toFixed(2));
        var dist = (r.distance_m === null || r.distance_m === undefined) ? 'â€”' : String(r.distance_m);

        tr.innerHTML =
          '<td class="mu">' + (dt ? dt.toLocaleString() : (r.poll_time || 'â€”')) + '</td>' +
          '<td><span style="color:' + stClr + ';font-weight:700">' + status + '</span></td>' +
          '<td class="mu">' + rx + '</td>' +
          '<td class="mu">' + dist + '</td>' +
          '<td class="mu">' + (r.olt_name || '-') + '</td>' +
          '<td class="mu">' + (r.olt_ip || 'â€”') + '</td>' +
          '<td class="mu">' + (r.pon_port || 'â€”') + '</td>' +
          '<td class="mu">' + (r.onu_id || 'â€”') + '</td>';
        tb.appendChild(tr);
      });
    }

    function renderOntRxChart(rows) {
      var pts = (rows || []).slice().reverse().filter(function (r) {
        return r.rx_power !== null && r.rx_power !== undefined && r.poll_time;
      });
      var labels = pts.map(function (r) { return new Date(r.poll_time).toLocaleString(); });
      var data = pts.map(function (r) { return Number(r.rx_power); });
      var meta = document.getElementById('ontChartMeta');
      meta.textContent = data.length ? (data.length + ' samples') : 'No Rx power samples';

      var ctx = document.getElementById('ontRxChart');
      if (!ctx) return;
      if (_ontChart) { _ontChart.destroy(); _ontChart = null; }
      _ontChart = new Chart(ctx, {
        type: 'line',
        data: {
          labels: labels,
          datasets: [{
            label: 'Rx Power (dBm)',
            data: data,
            borderColor: getComputedStyle(document.body).getPropertyValue('--accent3').trim() || '#39ff14',
            backgroundColor: 'rgba(57,255,20,0.08)',
            tension: 0.25,
            pointRadius: 2
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: false,
          plugins: {
            legend: { display: true, labels: { color: getComputedStyle(document.body).getPropertyValue('--text').trim() } }
          },
          scales: {
            x: { ticks: { color: getComputedStyle(document.body).getPropertyValue('--muted').trim(), maxTicksLimit: 6 } },
            y: { ticks: { color: getComputedStyle(document.body).getPropertyValue('--muted').trim() } }
          }
        }
      });
    }

    function onSettingsOverlayClick(ev) {
      if (ev.target.id === 'settingsModal') closeSettingsModal();
    }

    function openSettingsModal() {
      var modal = document.getElementById('settingsModal');
      var msg = document.getElementById('settingsModalMsg');
      if (msg) { msg.textContent = ''; msg.style.color = ''; }
      var pmsg = document.getElementById('portSettingsMsg');
      if (pmsg) { pmsg.textContent = ''; pmsg.style.display = 'none'; }
      modal.classList.add('show');
      var saveBtn = document.getElementById('settingsSaveBtn');
      var portsBtn = document.getElementById('portsSaveBtn');
      var tabsBtn = document.getElementById('settingsTabsSaveBtn');
      var timeoutBtn = document.getElementById('timeoutSaveBtn');
      var adminSections = document.getElementById('settingsAdminSections');
      var sessionSection = document.getElementById('settingsSessionSection');
      var admin = currentRole === 'admin';
      if (saveBtn) saveBtn.style.display = admin ? 'inline-block' : 'none';
      if (portsBtn) portsBtn.style.display = admin ? 'inline-block' : 'none';
      if (tabsBtn) tabsBtn.style.display = admin ? 'inline-block' : 'none';
      if (timeoutBtn) timeoutBtn.style.display = 'inline-block';
      if (adminSections) adminSections.style.display = admin ? 'block' : 'none';
      if (sessionSection) sessionSection.style.display = 'block';
      RETENTION_KEY_IDS.forEach(function (k) {
        var inp = document.getElementById(k);
        if (inp) inp.readOnly = !admin;
      });
      PORT_KEY_IDS.forEach(function (k) {
        var inp = document.getElementById(k);
        if (inp) inp.readOnly = !admin;
      });
      var toSel = document.getElementById('session_timeout_minutes');
      if (toSel) toSel.disabled = false;
      apiFetch('/api/settings/retention').then(function (m) {
        RETENTION_KEY_IDS.forEach(function (k) {
          var inp = document.getElementById(k);
          if (inp && m[k] !== undefined) inp.value = m[k];
        });
      }).catch(function (e) {
        if (e.message === '401') return;
        if (msg) { msg.textContent = 'Failed to load settings: ' + e.message; msg.style.color = 'var(--danger)'; }
      });

      apiFetch('/api/settings/ports').then(function (p) {
        currentPortSettings = p || {};
        PORT_KEY_IDS.forEach(function (k) {
          var inp = document.getElementById(k);
          if (inp && p[k] !== undefined) inp.value = p[k];
        });
        setTftpPortLabels(p.tftp_port);
      }).catch(function () { /* ignore */ });

      apiFetch('/api/settings/storage_stats').then(function (d) {
        var box = document.getElementById('retentionStats');
        if (!box) return;
        var items = (d && d.items) ? d.items : [];
        if (!items.length) { box.textContent = 'No stats available.'; return; }
        var lines = [];
        items.forEach(function (it) {
          var size = it.size_mb || '0.0 MB';
          lines.push((it.table || 'â€”') + ': ' + size);
        });
        box.textContent = lines.join('\n');
      }).catch(function () {
        var box = document.getElementById('retentionStats');
        if (box) box.textContent = 'Failed to load storage stats.';
      });

      apiFetch('/api/settings/security').then(function (d) {
        var sel = document.getElementById('session_timeout_minutes');
        if (!sel) return;
        var v = String(d.session_timeout_minutes || 30);
        sel.value = v;
      }).catch(function () { /* ignore */ });

      apiFetch('/api/settings/ui').then(function (d) {
        globalVisibleTabs = Array.isArray(d.visible_tabs) ? d.visible_tabs.slice() : getDefaultTabsForRole('viewer');
        setSettingsTabSelections(globalVisibleTabs);
        var settingsBox = document.getElementById('settingsVisibleTabs');
        if (settingsBox) {
          settingsBox.querySelectorAll('input[type="checkbox"]').forEach(function (cb) {
            cb.disabled = !admin;
          });
        }
        syncUserTabAvailability('nuVisibleTabs', document.getElementById('nuRole').value);
        syncUserTabAvailability('euVisibleTabs', document.getElementById('euRole').value);
      }).catch(function () { /* ignore */ });
    }

    function closeSettingsModal() {
      document.getElementById('settingsModal').classList.remove('show');
    }

    function saveRetentionSettings() {
      if (currentRole !== 'admin') return;
      var msg = document.getElementById('settingsModalMsg');
      var body = {};
      for (var i = 0; i < RETENTION_KEY_IDS.length; i++) {
        var k = RETENTION_KEY_IDS[i];
        var inp = document.getElementById(k);
        if (!inp) continue;
        var v = parseInt(inp.value, 10);
        if (isNaN(v)) {
          if (msg) { msg.textContent = 'Invalid number: ' + k; msg.style.color = 'var(--danger)'; }
          return;
        }
        body[k] = v;
      }
      apiPost('/api/settings/retention', body).then(function (d) {
        if (d.success) {
          if (msg) { msg.textContent = 'Saved.'; msg.style.color = 'var(--accent3)'; }
        } else {
          if (msg) { msg.textContent = d.error || 'Save failed'; msg.style.color = 'var(--danger)'; }
        }
      }).catch(function (e) {
        if (e.message === '401') return;
        if (msg) { msg.textContent = e.message || 'Save failed'; msg.style.color = 'var(--danger)'; }
      });
    }

    // â”€â”€ PORT SETTINGS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    function savePortSettings() {
      if (currentRole !== 'admin') return;
      var body = {};
      for (var i = 0; i < PORT_KEY_IDS.length; i++) {
        var key = PORT_KEY_IDS[i];
        var inp = document.getElementById(key);
        var value = inp ? parseInt(inp.value, 10) : NaN;
        if (isNaN(value) || value < 1 || value > 65535) {
          showMsg('portSettingsMsg', 'Invalid port: ' + key, false, true);
          return;
        }
        body[key] = value;
      }
      apiPost('/api/settings/ports', body).then(function (r) {
        currentPortSettings = r || {};
        setTftpPortLabels(r.tftp_port);
        showMsg('portSettingsMsg', r.message || 'Ports saved. Restart SimpleNOC to apply them.', true, true);
      }).catch(function (e) {
        if (e.message === '401') return;
        showMsg('portSettingsMsg', e.message || 'Save failed', false, true);
      });
    }

    function saveSessionTimeout() {
      var sel = document.getElementById('session_timeout_minutes');
      var msg = document.getElementById('sessionTimeoutMsg');
      var v = sel ? parseInt(sel.value, 10) : 30;
      apiPost('/api/settings/security', { session_timeout_minutes: v }).then(function (r) {
        if (r && r.success) {
          if (msg) showMsg('sessionTimeoutMsg', 'Saved. New sessions will use this timeout.', true, true);
        } else {
          if (msg) showMsg('sessionTimeoutMsg', (r && r.error) ? r.error : 'Save failed', false, true);
        }
      }).catch(function (e) {
        if (e.message === '401') return;
        if (msg) showMsg('sessionTimeoutMsg', e.message || 'Save failed', false, true);
      });
    }

    function saveVisibleTabSettings() {
      if (currentRole !== 'admin') return;
      var tabs = getSettingsTabSelections();
      apiPost('/api/settings/ui', { visible_tabs: tabs }).then(function (r) {
        globalVisibleTabs = Array.isArray(r.visible_tabs) ? r.visible_tabs.slice() : tabs.slice();
        setSettingsTabSelections(globalVisibleTabs);
        syncUserTabAvailability('nuVisibleTabs', document.getElementById('nuRole').value);
        syncUserTabAvailability('euVisibleTabs', document.getElementById('euRole').value);
        if (currentRole === 'admin') {
          currentVisibleTabs = getDefaultTabsForRole('admin');
        } else {
          currentVisibleTabs = currentVisibleTabs.filter(function (tab) {
            return globalVisibleTabs.indexOf(tab) !== -1;
          });
        }
        applyVisibleTabs(currentVisibleTabs);
        showMsg('settingsTabsMsg', 'Visible tabs saved successfully.', true, true);
      }).catch(function (e) {
        if (e.message === '401') return;
        showMsg('settingsTabsMsg', e.message || 'Save failed', false, true);
      });
    }

    function applyVisibleTabs(tabs) {
      var isAdm = (currentRole === 'admin');
      if (isAdm) {
        tabs = getDefaultTabsForRole('admin');
      } else {
        if (!Array.isArray(tabs) || !tabs.length) {
          tabs = getDefaultTabsForRole(currentRole || 'viewer');
        }
      }

      // Hide/show tab buttons
      document.querySelectorAll('.tab[data-tab]').forEach(function (btn) {
        var t = btn.dataset.tab;
        var show = isAdm || (tabs.indexOf(t) !== -1);
        if (t === 'users') {
          btn.style.display = isAdm ? 'block' : 'none';
        } else {
          btn.style.display = show ? '' : 'none';
        }
      });

      // Hide/show panels
      document.querySelectorAll('.tc[id^="tab-"]').forEach(function (panel) {
        var t = panel.id.replace('tab-', '');
        var show = isAdm || (tabs.indexOf(t) !== -1);
        if (!show) {
          panel.style.display = 'none';
        } else {
          panel.style.removeProperty('display');
        }
      });

      // Ensure we have an active visible tab
      var activeBtn = document.querySelector('.tab.active');
      var activeTab = (activeBtn && activeBtn.dataset && activeBtn.dataset.tab) ? activeBtn.dataset.tab : '';
      var isVisible = activeBtn && activeBtn.style.display !== 'none';
      if (!activeTab || !isVisible || (!isAdm && tabs.indexOf(activeTab) === -1)) {
        var next = (isAdm || tabs.indexOf('dashboard') !== -1) ? 'dashboard' : (tabs[0] || 'dashboard');
        switchTab(next);
      }
    }

    // â”€â”€ CHARTS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    function toggleEvtDetail(expId) {
      var rows = document.querySelectorAll('[id^="evtexp_"]');
      rows.forEach(function (r) {
        if (r.id === expId) {
          r.style.display = r.style.display === 'none' ? 'table-row' : 'none';
        } else {
          r.style.display = 'none';
        }
      });
    }

    function timeAgo(ts) {
      var diff = Math.floor((Date.now() - new Date(ts)) / 1000);
      if (diff < 60) return diff + 's ago';
      if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
      if (diff < 86400) return Math.floor(diff / 3600) + 'h ' + Math.floor((diff % 3600) / 60) + 'm ago';
      return Math.floor(diff / 86400) + 'd ' + Math.floor((diff % 86400) / 3600) + 'h ago';
    }

    function parseEventDetails(tag, msg) {
      var details = msg;
      var who = '';

      var uplinkM = msg.match(/Uplink-port\s+([\d\/]+)\s+(Up|Down)/i);
      if (uplinkM) {
        details = 'Uplink-port ' + uplinkM[1] + ' is ' + uplinkM[2].toUpperCase();
        who = 'Port ' + uplinkM[1];
        return { details: details, who: who };
      }

      var loginM = msg.match(/User\s+(\S+)\s+logged\s+(in|out)\s+from\s+([\d.]+)(?:\s+on\s+(\S+))?/i);
      if (loginM) {
        var via = loginM[4] ? loginM[4].toUpperCase().replace('.', '') : '';
        details = loginM[2].toLowerCase() === 'in' ? 'Logged IN' : 'Logged OUT';
        if (via) details += ' via ' + via;
        who = loginM[1] + ' from ' + loginM[3];
        return { details: details, who: who };
      }

      var failM = msg.match(/User\s+(\S+)\s+login\s+failed\s+from\s+([\d.]+)/i);
      if (failM) {
        return { details: 'Login FAILED', who: failM[1] + ' from ' + failM[2] };
      }

      return { details: details.substring(0, 60), who: '' };
    }

    function buildEventsTable(tbody, events) {
      tbody.innerHTML = '';
      events.forEach(function (e) {
        var tag = e.event_tag || '';
        var msg = e.message || '';
        var expId = 'evtexp_' + e.id;
        var parsed = parseEventDetails(tag, msg);
        var dt = new Date(e.timestamp);
        var ago = timeAgo(e.timestamp);

        // Main data row
        var tr = document.createElement('tr');
        tr.style.cursor = 'pointer';
        tr.onclick = (function (id) { return function () { toggleEvtDetail(id); }; })(expId);

        var tdTime = document.createElement('td');
        tdTime.innerHTML = '<div class="mu" style="font-size:11px">' + dt.toLocaleDateString() + '</div>' +
          '<div class="mu" style="font-size:11px">' + dt.toLocaleTimeString() + '</div>';
        tr.appendChild(tdTime);

        var tdAgo = document.createElement('td');
        tdAgo.innerHTML = '<span style="font-size:10px;color:var(--warn)">' + ago + '</span>';
        tr.appendChild(tdAgo);

        var tdOlt = document.createElement('td');
        tdOlt.innerHTML = oltBadge(e.olt_hostname || e.source_ip);
        tr.appendChild(tdOlt);

        var tdTag = document.createElement('td');
        tdTag.innerHTML = tagBadge(tag);
        tr.appendChild(tdTag);

        var tdDet = document.createElement('td');
        tdDet.style.fontSize = '12px';
        tdDet.textContent = parsed.details;
        tr.appendChild(tdDet);

        var tdWho = document.createElement('td');
        tdWho.style.color = 'var(--accent2)';
        tdWho.style.fontSize = '11px';
        tdWho.textContent = parsed.who;
        tr.appendChild(tdWho);

        var tdArr = document.createElement('td');
        tdArr.style.textAlign = 'center';
        tdArr.style.color = 'var(--muted)';
        tdArr.textContent = 'v';
        tr.appendChild(tdArr);

        tbody.appendChild(tr);

        // Expandable detail row
        var trExp = document.createElement('tr');
        trExp.id = expId;
        trExp.style.display = 'none';

        var tdExp = document.createElement('td');
        tdExp.colSpan = 7;
        tdExp.style.padding = '0';

        var div = document.createElement('div');
        div.style.cssText = 'background:rgba(0,0,0,0.35);border-left:3px solid var(--accent);padding:12px 16px';

        var label = document.createElement('div');
        label.style.cssText = 'font-size:9px;color:var(--muted);letter-spacing:2px;margin-bottom:6px;text-transform:uppercase';
        label.textContent = 'Full Message';
        div.appendChild(label);

        var msgDiv = document.createElement('div');
        msgDiv.style.cssText = 'font-family:"Share Tech Mono",monospace;font-size:12px;color:var(--accent3);word-break:break-all;margin-bottom:10px';
        msgDiv.textContent = msg;
        div.appendChild(msgDiv);

        var meta = document.createElement('div');
        meta.style.cssText = 'display:flex;gap:18px;flex-wrap:wrap';

        var metaItems = [
          ['OLT', e.olt_hostname || 'â€”'],
          ['Source IP', e.source_ip || 'â€”'],
          ['Severity', e.severity || 'â€”'],
          ['Facility', e.facility || 'â€”'],
          ['Full Time', dt.toLocaleString()]
        ];
        metaItems.forEach(function (item) {
          var span = document.createElement('span');
          span.style.fontSize = '10px';
          span.style.color = 'var(--muted)';
          span.innerHTML = item[0] + ': <span style="color:var(--text)">' + item[1] + '</span>';
          meta.appendChild(span);
        });
        div.appendChild(meta);

        tdExp.appendChild(div);
        trExp.appendChild(tdExp);
        tbody.appendChild(trExp);
      });
    }


    // â”€â”€ ALERT FUNCTIONS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    // â”€â”€ EMAIL TEMPLATE FUNCTIONS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    var DEFAULT_SUBJECT = '{status_dot} [SimpleNOC Alert] {rule_name} - {olt_host}';
    var DEFAULT_BODY = [
      '{status_dot} SimpleNOC Alert Notification',
      '====================================================',
      '',
      '  Status    : {status}',
      '  Rule      : {rule_name}',
      '  OLT Host  : {olt_host}',
      '  Source IP : {source_ip}',
      '  Time      : {time}',
      '  Severity  : {severity}',
      '',
      '====================================================',
      '  Message:',
      '',
      '  {message}',
      '',
      '====================================================',
      '  Rule Conditions:',
      '  Host Match : {host_match}',
      '  Text Match : {text_match}',
      '',
      '====================================================',
      '  This is an automated alert from SimpleNOC v0.5.6.6'
    ].join('\n');

    function toggleEmailTemplate() {
      var wrap = document.getElementById('alTplBody_wrap');
      var arrow = document.getElementById('alTplArrow');
      if (!wrap) return;
      var open = wrap.style.display !== 'none';
      wrap.style.display = open ? 'none' : 'block';
      arrow.style.transform = open ? '' : 'rotate(180deg)';
    }

    function loadEmailTemplate() {
      apiFetch('/api/alerts/template').then(function (d) {
        var subj = d.subject || DEFAULT_SUBJECT;
        var body = d.body || DEFAULT_BODY;
        document.getElementById('alTplSubject').value = subj;
        document.getElementById('alTplBody').value = body;
        // Show subject preview in collapsed header
        var st = document.getElementById('alTplStatus');
        if (st) st.textContent = subj.length > 50 ? subj.substring(0, 50) + '...' : subj;
      }).catch(function () {
        document.getElementById('alTplSubject').value = DEFAULT_SUBJECT;
        document.getElementById('alTplBody').value = DEFAULT_BODY;
      });
    }

    function saveEmailTemplate() {
      var subj = document.getElementById('alTplSubject').value.trim();
      var body = document.getElementById('alTplBody').value;
      if (!subj || !body) {
        showMsg('alTplMsg', 'Subject and body are required', false, true);
        return;
      }
      apiPost('/api/alerts/template', { subject: subj, body: body }).then(function (r) {
        if (r.success) {
          showMsg('alTplMsg', 'Template saved!', true, false);
          var st = document.getElementById('alTplStatus');
          if (st) st.textContent = subj.length > 50 ? subj.substring(0, 50) + '...' : subj;
          // Auto-collapse after save
          setTimeout(function () { toggleEmailTemplate(); }, 800);
        } else {
          showMsg('alTplMsg', r.error || 'Failed', false, false);
        }
      });
    }

    function resetEmailTemplate() {
      document.getElementById('alTplSubject').value = DEFAULT_SUBJECT;
      document.getElementById('alTplBody').value = DEFAULT_BODY;
      apiPost('/api/alerts/template', { subject: DEFAULT_SUBJECT, body: DEFAULT_BODY }).then(function () {
        showMsg('alTplMsg', 'Reset to default template', true, false);
      });
    }

    function loadAlerts() {
      // Load email config
      apiFetch('/api/alerts/email_config').then(function (d) {
        document.getElementById('alSmtpHost').value = d.smtp_host || '';
        document.getElementById('alSmtpPort').value = d.smtp_port || 587;
        document.getElementById('alSmtpUser').value = d.smtp_user || '';
        document.getElementById('alFromAddr').value = d.from_addr || '';
        document.getElementById('alUseTls').checked = !!d.use_tls;
        document.getElementById('alEnabled').checked = !!d.enabled;
        var st = document.getElementById('alEmailStatus');
        if (d.enabled && d.smtp_host) {
          st.textContent = 'Configured';
          st.style.color = 'var(--accent3)';
        } else {
          st.textContent = d.smtp_host ? 'Disabled' : 'Not configured';
          st.style.color = d.smtp_host ? 'var(--warn)' : 'var(--danger)';
        }
      }).catch(function () { });

      // Load Telegram config
      apiFetch('/api/alerts/telegram_config').then(function (d) {
        document.getElementById('alTgToken').value = d.bot_token || '';
        document.getElementById('alTgChatId').value = d.chat_id || '';
        document.getElementById('alTgEnabled').checked = !!d.enabled;
        var st = document.getElementById('alTelegramStatus');
        if (d.enabled && (d.token_set || d.bot_token) && d.chat_id) {
          st.textContent = 'Configured';
          st.style.color = 'var(--accent3)';
        } else {
          st.textContent = (d.token_set || d.bot_token) ? 'Disabled' : 'Not configured';
          st.style.color = (d.token_set || d.bot_token) ? 'var(--warn)' : 'var(--danger)';
        }
      }).catch(function () { });

      // Load Discord config
      apiFetch('/api/alerts/discord_config').then(function (d) {
        document.getElementById('alDcWebhook').value = d.webhook_url || '';
        document.getElementById('alDcEnabled').checked = !!d.enabled;
        var st = document.getElementById('alDiscordStatus');
        if (d.enabled && (d.webhook_set || d.webhook_url)) {
          st.textContent = 'Configured';
          st.style.color = 'var(--accent3)';
        } else {
          st.textContent = (d.webhook_set || d.webhook_url) ? 'Disabled' : 'Not configured';
          st.style.color = (d.webhook_set || d.webhook_url) ? 'var(--warn)' : 'var(--danger)';
        }
      }).catch(function () { });

      // Load stats
      apiFetch('/api/alerts/stats').then(function (d) {
        var active = (d.rules || []).filter(function (r) { return r.enabled; }).length;
        document.getElementById('alRulesActive').textContent = active;
        document.getElementById('alSent').textContent = d.total_sent || 0;
        document.getElementById('alFailed').textContent = d.total_failed || 0;
        document.getElementById('alTotal').textContent = (d.rules || []).length;
        buildRulesTable(d.rules || []);
      }).catch(function () { });

      // Load alert log
      loadEmailTemplate();

      apiFetch('/api/alerts/log').then(function (logs) {
        document.getElementById('alLogCount').textContent = logs.length + ' alerts';
        var tb = document.getElementById('alLogTable');
        if (!logs.length) {
          tb.innerHTML = '<tr><td colspan="5"><div class="empty">No alerts sent yet.</div></td></tr>';
          return;
        }
        var html = '';
        logs.forEach(function (l) {
          var sentBadge = l.sent
            ? '<span class="b bg">SENT</span>'
            : '<span class="b br">FAILED</span>';
          html += '<tr>';
          html += '<td class="mu">' + new Date(l.timestamp).toLocaleString() + '</td>';
          html += '<td style="color:var(--accent2)">' + (l.rule_name || 'â€”') + '</td>';
          html += '<td><span class="b bc">' + (l.host || 'â€”') + '</span></td>';
          html += '<td>' + sentBadge + '</td>';
          html += '<td class="mu" style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + (l.message || '') + '</td>';
          html += '</tr>';
        });
        tb.innerHTML = html;
      }).catch(function () { });
    }

    function buildRulesTable(rules) {
      document.getElementById('alRuleCount').textContent = rules.length + ' rules';
      var tb = document.getElementById('alRulesTable');
      tb.innerHTML = '';
      if (!rules.length) {
        tb.innerHTML = '<tr><td colspan="11"><div class="empty">No rules yet. Add one above.</div></td></tr>';
        return;
      }
      rules.forEach(function (r) {
        var tr = document.createElement('tr');
        var lastHit = r.last_hit ? new Date(r.last_hit).toLocaleString() : 'Never';
        var sourceLabel = (r.source_type || 'syslog') === 'ping' ? 'PING OFFLINE' : 'SYSLOG';

        var cells = [
          { text: r.id, cls: 'mu' },
          { html: '<span style="color:var(--text);font-weight:700">' + r.name + '</span>' },
          { html: '<span class="b bc">' + sourceLabel + '</span>' },
          { html: '<span class="b bc">' + (r.host_match || 'any') + '</span>' },
          { html: '<span class="mono" style="font-size:10px;color:var(--muted)">' + ((r.exclude_hosts || '').replace(/\n/g, '<br>') || 'â€”') + '</span>' },
          { html: '<span class="mono" style="font-size:10px;color:var(--accent3)">' + (r.text_match || '').replace(/\n/g, '<br>') + '</span>' },
          { text: (r.to_email || 'â€”') + ' (' + (r.notify_via || 'both') + ')', cls: 'mu' },
          { html: '<span style="color:var(--warn)">' + (r.hit_count || 0) + '</span>' },
          { html: '<span class="mu" style="font-size:10px">' + lastHit + '</span>' },
          { html: r.enabled ? '<span class="b bg">ACTIVE</span>' : '<span class="b bx">OFF</span>' },
        ];

        cells.forEach(function (c) {
          var td = document.createElement('td');
          if (c.html !== undefined) td.innerHTML = c.html;
          else td.textContent = c.text;
          if (c.cls) td.className = c.cls;
          tr.appendChild(td);
        });

        var tdBtn = document.createElement('td');
        tdBtn.style.cssText = 'display:flex;gap:5px;padding:5px';
        var togBtn = document.createElement('button');
        togBtn.className = 'rb';
        togBtn.style.cssText = 'font-size:10px;padding:3px 8px';
        togBtn.textContent = r.enabled ? 'Disable' : 'Enable';
        togBtn.onclick = (function (id) { return function () { toggleAlertRule(id); }; })(r.id);
        var editBtn = document.createElement('button');
        editBtn.className = 'ubtn';
        editBtn.style.cssText = 'font-size:10px;padding:3px 8px;border-color:var(--accent2);color:var(--accent2)';
        editBtn.textContent = 'Edit';
        editBtn.onclick = (function (rule) { return function () { openEditAlertModal(rule); }; })(r);
        var delBtn = document.createElement('button');
        delBtn.className = 'dbtn';
        delBtn.style.cssText = 'font-size:10px;padding:3px 8px';
        delBtn.textContent = 'Del';
        delBtn.onclick = (function (id) { return function () { deleteAlertRule(id); }; })(r.id);
        tdBtn.appendChild(togBtn);
        tdBtn.appendChild(editBtn);
        tdBtn.appendChild(delBtn);
        tr.appendChild(tdBtn);
        tb.appendChild(tr);
      });
    }
    function saveEmailConfig() {
      var d = {
        smtp_host: document.getElementById('alSmtpHost').value.trim(),
        smtp_port: parseInt(document.getElementById('alSmtpPort').value) || 587,
        smtp_user: document.getElementById('alSmtpUser').value.trim(),
        smtp_pass: document.getElementById('alSmtpPass').value,
        from_addr: document.getElementById('alFromAddr').value.trim(),
        use_tls: document.getElementById('alUseTls').checked,
        enabled: document.getElementById('alEnabled').checked
      };
      apiPost('/api/alerts/email_config', d).then(function (r) {
        showMsg('alEmailMsg', r.success ? 'Email config saved!' : (r.error || 'Failed'), r.success);
        if (r.success) loadAlerts();
      });
    }

    function sendTestEmail() {
      var to = document.getElementById('alTestEmail').value.trim();
      if (!to) { showMsg('alEmailMsg', 'Enter a recipient email first', false); return; }
      showMsg('alEmailMsg', 'Connecting to SMTP server...', true);
      apiPost('/api/alerts/test_email', { to_email: to }).then(function (r) {
        showMsg('alEmailMsg', r.success ? 'Test email sent to ' + to + '! Check your inbox.' : 'ERROR: ' + r.error, r.success);
      }).catch(function (e) {
        showMsg('alEmailMsg', 'Request failed: ' + e.message, false);
      });
    }

    function checkEmailDiag() {
      apiFetch('/api/alerts/email_diag').then(function (d) {
        var ok = d.issues.length === 0;
        var lines = [
          'SMTP Host : ' + d.smtp_host,
          'SMTP Port : ' + d.smtp_port,
          'Username  : ' + d.smtp_user,
          'From Addr : ' + d.from_addr,
          'Password  : ' + (d.pass_set ? '(set)' : '(EMPTY - not saved!)'),
          'Use TLS   : ' + d.use_tls,
          'Enabled   : ' + d.enabled,
          '',
          ok ? 'Status: Config looks OK' : 'Issues: ' + d.issues.join(' | ')
        ];
        var el = document.getElementById('alEmailMsg');
        if (!el) return;
        el.textContent = lines.join('\n');
        el.style.display = 'block';
        el.style.whiteSpace = 'pre';
        el.style.fontFamily = 'monospace';
        el.style.fontSize = '11px';
        el.style.lineHeight = '1.7';
        el.style.background = ok ? 'rgba(57,255,20,0.08)' : 'rgba(255,45,85,0.08)';
        el.style.border = '1px solid ' + (ok ? 'rgba(57,255,20,0.3)' : 'rgba(255,45,85,0.3)');
        el.style.color = ok ? 'var(--accent3)' : 'var(--danger)';
        el.style.padding = '12px 14px';
        el.style.borderRadius = '4px';
        el.style.marginTop = '8px';
      }).catch(function (e) {
        showMsg('alEmailMsg', 'Error: ' + e.message, false, true);
      });
    }

    function saveTelegramConfig() {
      var d = {
        bot_token: document.getElementById('alTgToken').value.trim(),
        chat_id: document.getElementById('alTgChatId').value.trim(),
        enabled: document.getElementById('alTgEnabled').checked
      };
      apiPost('/api/alerts/telegram_config', d).then(function (r) {
        showMsg('alTelegramMsg', r.success ? 'Telegram config saved!' : (r.error || 'Failed'), !!r.success);
        if (r.success) loadAlerts();
      }).catch(function (e) {
        showMsg('alTelegramMsg', 'Request failed: ' + e.message, false, true);
      });
    }

    function sendTestTelegram() {
      showMsg('alTelegramMsg', 'Sending test message...', true, true);
      apiPost('/api/alerts/test_telegram', {}).then(function (r) {
        showMsg('alTelegramMsg', r.success ? String(r.error || 'Telegram sent!') : ('ERROR: ' + r.error), !!r.success, true);
      }).catch(function (e) {
        showMsg('alTelegramMsg', 'Request failed: ' + e.message, false, true);
      });
    }

    function saveDiscordConfig() {
      var d = {
        webhook_url: document.getElementById('alDcWebhook').value.trim(),
        enabled: document.getElementById('alDcEnabled').checked
      };
      apiPost('/api/alerts/discord_config', d).then(function (r) {
        showMsg('alDiscordMsg', r.success ? 'Discord config saved!' : (r.error || 'Failed'), !!r.success);
        if (r.success) loadAlerts();
      }).catch(function (e) {
        showMsg('alDiscordMsg', 'Request failed: ' + e.message, false, true);
      });
    }

    function sendTestDiscord() {
      showMsg('alDiscordMsg', 'Sending test message...', true, true);
      apiPost('/api/alerts/test_discord', {}).then(function (r) {
        showMsg('alDiscordMsg', r.success ? String(r.error || 'Discord sent!') : ('ERROR: ' + r.error), !!r.success, true);
      }).catch(function (e) {
        showMsg('alDiscordMsg', 'Request failed: ' + e.message, false, true);
      });
    }

    function addAlertRule() {
      var name = document.getElementById('alRuleName').value.trim();
      var source_type = document.getElementById('alSourceType').value;
      var host_match = document.getElementById('alHostMatch').value.trim();
      var exclude_hosts = document.getElementById('alExcludeHosts').value.trim();
      var text_match = document.getElementById('alTextMatch').value.trim();
      var to_email = document.getElementById('alToEmail').value.trim();
      var notify_via = document.getElementById('alNotifyVia') ? document.getElementById('alNotifyVia').value : 'both';
      if (!name) {
        showMsg('alRuleMsg', 'Rule name is required', false);
        return;
      }
      if (source_type === 'syslog' && !text_match) {
        showMsg('alRuleMsg', 'Text match is required for syslog alerts', false);
        return;
      }
      if ((notify_via === 'email' || notify_via === 'both') && !to_email) {
        showMsg('alRuleMsg', 'Email is required when alerting via Email', false);
        return;
      }
      apiPost('/api/alerts/rules/add', { name: name, source_type: source_type, host_match: host_match, exclude_hosts: exclude_hosts, text_match: text_match, to_email: to_email, notify_via: notify_via })
        .then(function (r) {
          if (r.success) {
            showMsg('alRuleMsg', 'Rule added!', true);
            document.getElementById('alRuleName').value = '';
            document.getElementById('alSourceType').value = 'syslog';
            document.getElementById('alHostMatch').value = '';
            document.getElementById('alExcludeHosts').value = '';
            document.getElementById('alTextMatch').value = '';
            document.getElementById('alToEmail').value = '';
            if (document.getElementById('alNotifyVia')) document.getElementById('alNotifyVia').value = 'both';
            updateAlertRuleSourceUI();
            loadAlerts();
          } else { showMsg('alRuleMsg', r.error || 'Failed', false); }
        });
    }

    function updateAlertRuleSourceUI() {
      var source = document.getElementById('alSourceType') ? document.getElementById('alSourceType').value : 'syslog';
      var wrap = document.getElementById('alTextMatchWrap');
      var host = document.getElementById('alHostMatch');
      var text = document.getElementById('alTextMatch');
      if (wrap) wrap.style.display = source === 'syslog' ? 'block' : 'none';
      if (host) host.placeholder = source === 'ping' ? 'Optional host label or IP filter' : 'e.g. BSNL_TMG';
      if (text) text.placeholder = source === 'syslog' ? 'Uplink-port\nDown' : '';
    }

    function deleteAlertRule(id) {
      if (!confirm('Delete this alert rule?')) return;
      apiPost('/api/alerts/rules/delete', { id: id }).then(function () { loadAlerts(); });
    }

    function toggleAlertRule(id) {
      apiPost('/api/alerts/rules/toggle', { id: id }).then(function () { loadAlerts(); });
    }

    function openEditAlertModal(r) {
      document.getElementById('editAlertId').value = r.id;
      document.getElementById('editAlertName').value = r.name || '';
      document.getElementById('editAlertSource').value = r.source_type || 'syslog';
      document.getElementById('editAlertHost').value = r.host_match || '';
      document.getElementById('editAlertExclude').value = r.exclude_hosts || '';
      document.getElementById('editAlertText').value = r.text_match || '';
      document.getElementById('editAlertNotify').value = r.notify_via || 'both';
      document.getElementById('editAlertEmail').value = r.to_email || '';
      document.getElementById('editAlertMsg').style.display = 'none';
      document.getElementById('editAlertModal').classList.add('show');
    }

    function saveEditAlertRule() {
      var d = {
        id: document.getElementById('editAlertId').value,
        name: document.getElementById('editAlertName').value,
        source_type: document.getElementById('editAlertSource').value,
        host_match: document.getElementById('editAlertHost').value,
        exclude_hosts: document.getElementById('editAlertExclude').value,
        text_match: document.getElementById('editAlertText').value,
        notify_via: document.getElementById('editAlertNotify').value,
        to_email: document.getElementById('editAlertEmail').value.trim()
      };
      
      if ((d.notify_via === 'email' || d.notify_via === 'both') && !d.to_email) {
        showMsg('editAlertMsg', 'Email is required when alerting via Email', false, true);
        return;
      }
      
      apiPost('/api/alerts/rules/edit', d).then(function (r) {
        if (r.success) {
          document.getElementById('editAlertModal').classList.remove('show');
          loadAlerts();
        } else {
          showMsg('editAlertMsg', r.error || 'Failed', false, true);
        }
      }).catch(function (e) {
        showMsg('editAlertMsg', e.message, false, true);
      });
    }


    // â”€â”€ DRAGGABLE TABS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    var dragSrcTab = null;
    var TAB_ORDER_KEY = 'noc_tab_order';

    function onTabDragStart(e) {
      dragSrcTab = e.currentTarget;
      e.currentTarget.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', e.currentTarget.dataset.tab);
    }

    function onTabDragOver(e) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      document.querySelectorAll('.tab').forEach(function (t) { t.classList.remove('drag-over'); });
      if (e.currentTarget !== dragSrcTab) {
        e.currentTarget.classList.add('drag-over');
      }
    }

    function onTabDrop(e) {
      e.preventDefault();
      if (!dragSrcTab || dragSrcTab === e.currentTarget) return;
      var bar = document.getElementById('tabBar');
      var tabs = Array.from(bar.querySelectorAll('.tab'));
      var srcIdx = tabs.indexOf(dragSrcTab);
      var tgtIdx = tabs.indexOf(e.currentTarget);
      if (srcIdx < tgtIdx) {
        bar.insertBefore(dragSrcTab, e.currentTarget.nextSibling);
      } else {
        bar.insertBefore(dragSrcTab, e.currentTarget);
      }
      document.querySelectorAll('.tab').forEach(function (t) { t.classList.remove('drag-over'); });
      saveTabOrder();
    }

    function onTabDragEnd(e) {
      e.currentTarget.classList.remove('dragging');
      document.querySelectorAll('.tab').forEach(function (t) { t.classList.remove('drag-over'); });
      dragSrcTab = null;
    }

    function saveTabOrder() {
      var bar = document.getElementById('tabBar');
      var tabs = Array.from(bar.querySelectorAll('.tab'));
      var order = tabs.map(function (t) { return t.dataset.tab; });
      try { localStorage.setItem(TAB_ORDER_KEY, JSON.stringify(order)); } catch (e) { }
    }

    function loadTabOrder() {
      try {
        var saved = localStorage.getItem(TAB_ORDER_KEY);
        if (!saved) return;
        var order = JSON.parse(saved);
        var bar = document.getElementById('tabBar');
        order.forEach(function (tabId) {
          var el = document.getElementById('tab-btn-' + tabId);
          if (el) bar.appendChild(el);
        });
      } catch (e) { }
    }

    // â”€â”€ TFTP FUNCTIONS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    function downloadBackup() {
      showMsg('backupMsg', 'Preparing backup...', true, true);
      window.location.href = API + '/api/backup/download';
      showMsg('backupMsg', 'Backup download started.', true, true);
    }

    function restoreBackup(event) {
      var file = event.target.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function (e) {
        try {
          var backup = JSON.parse(e.target.result);
          if (!backup.version) {
            showMsg('backupMsg', 'Invalid backup file.', false, true);
            return;
          }
          if (!confirm('Restore this backup and replace the current PostgreSQL data?')) {
            event.target.value = '';
            return;
          }
          showMsg('backupMsg', 'Restoring... please wait.', true, true);
          apiPost('/api/backup/restore', backup).then(function (result) {
            var restored = result.restored || {};
            var summary = Object.keys(restored).sort().map(function (table) {
              return table + ': ' + restored[table] + ' rows restored';
            }).join('\n');
            showMsg('backupMsg', '\u2705 Restore complete!\n' + summary, true, true);
            var el = document.getElementById('backupMsg');
            if (el) { el.style.whiteSpace = 'pre'; el.style.fontFamily = 'monospace'; }
            loadAlerts();
            fetchPing();
            loadTftp();
            loadUsers();
          }).catch(function (err) {
            var msg = err.message || 'Unknown error';
            // Provide a clear hint when decryption fails
            if (msg.indexOf('Decryption failed') !== -1 || msg.indexOf('decrypt') !== -1) {
              msg = '\u26a0\ufe0f Decryption error: This backup was created on a different SimpleNOC ' +
                'instance or with a different PostgreSQL password. Restore cannot proceed.\n\nDetail: ' + msg;
            } else {
              msg = '\u274c Restore error: ' + msg;
            }
            showMsg('backupMsg', msg, false, true);
            var el = document.getElementById('backupMsg');
            if (el) { el.style.whiteSpace = 'pre-wrap'; el.style.fontFamily = 'monospace'; }
          });
        } catch (err) {
          showMsg('backupMsg', 'Failed to parse backup file: ' + err.message, false, true);
        }
      };
      reader.readAsText(file);
      event.target.value = '';
    }

    function formatBytes(bytes) {
      if (!bytes || bytes === 0) return '0 B';
      if (bytes < 1024) return bytes + ' B';
      if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
      return (bytes / 1048576).toFixed(1) + ' MB';
    }

    var tftpAllFiles = [];  // global store for filter

    function loadTftp() {
      // Load config
      apiFetch('/api/tftp/config').then(function (d) {
        document.getElementById('tftpDir').value = d.backup_dir || '';
        document.getElementById('tftpEnabled').checked = !!d.enabled;
      }).catch(function () { });

      // Load stats
      apiFetch('/api/tftp/stats').then(function (d) {
        document.getElementById('tftpTotal').textContent = d.total || 0;
        document.getElementById('tftpOk').textContent = d.ok || 0;
        document.getElementById('tftpSize').textContent = formatBytes(d.total_size);

        // Recent files panel
        var rec = document.getElementById('tftpRecentList');
        if (!d.recent || !d.recent.length) {
          rec.innerHTML = '<div class="empty">No backups received yet.</div>';
        } else {
          rec.innerHTML = '';
          d.recent.forEach(function (f) {
            var div = document.createElement('div');
            div.style.cssText = 'background:rgba(0,229,255,0.04);border:1px solid var(--border);border-radius:6px;padding:10px 14px;display:flex;justify-content:space-between;align-items:center';
            var left = document.createElement('div');
            var dt = new Date(f.timestamp);
            left.innerHTML =
              '<div style="font-size:12px;color:var(--text);font-weight:700">' + (f.filename || 'â€”') + '</div>' +
              '<div style="font-size:10px;color:var(--muted);margin-top:3px">' +
              oltBadge(f.olt_name || f.source_ip) + ' &nbsp; ' + dt.toLocaleString() + '</div>';
            var right = document.createElement('div');
            right.style.cssText = 'display:flex;gap:6px;align-items:center';
            var sz = document.createElement('span');
            sz.style.cssText = 'font-size:10px;color:var(--accent2)';
            sz.textContent = formatBytes(f.file_size);
            var btn = document.createElement('a');
            btn.href = '/api/tftp/download/' + f.id;
            btn.style.cssText = 'font-size:10px;padding:3px 10px;border:1px solid var(--accent);color:var(--accent);border-radius:3px;text-decoration:none';
            btn.textContent = 'Download';
            right.appendChild(sz);
            right.appendChild(btn);
            div.appendChild(left);
            div.appendChild(right);
            rec.appendChild(div);
          });
        }
      }).catch(function () { });

      // Load full files table
      apiFetch('/api/tftp/files').then(function (files) {
        tftpAllFiles = files;
        document.getElementById('tftpFileCount').textContent = files.length + ' files';
        buildTftpTable(files);
        buildTftpOltBadges(files);
      }).catch(function () { });
    }

    function buildTftpOltBadges(files) {
      // Build unique OLT list as clickable quick-filter badges
      var olts = {};
      files.forEach(function (f) {
        var key = f.olt_name || f.source_ip || 'â€”';
        olts[key] = (olts[key] || 0) + 1;
      });
      var container = document.getElementById('tftpOltBadges');
      if (!container) return;
      container.innerHTML = '';
      if (!Object.keys(olts).length) return;

      var label = document.createElement('span');
      label.style.cssText = 'font-size:10px;color:var(--muted);align-self:center;white-space:nowrap';
      label.textContent = 'Quick filter:';
      container.appendChild(label);

      Object.keys(olts).sort().forEach(function (olt) {
        var btn = document.createElement('button');
        btn.style.cssText = 'font-size:10px;padding:3px 10px;border:1px solid var(--accent);' +
          'color:var(--accent);background:transparent;border-radius:12px;' +
          'cursor:pointer;white-space:nowrap';
        btn.textContent = olt + ' (' + olts[olt] + ')';
        btn.onclick = function () {
          document.getElementById('tftpFilterOlt').value = olt;
          document.getElementById('tftpFilterFile').value = '';
          filterTftpTable();
        };
        container.appendChild(btn);
      });
    }

    function filterTftpTable() {
      var oltFilter = (document.getElementById('tftpFilterOlt').value || '').toLowerCase().trim();
      var fileFilter = (document.getElementById('tftpFilterFile').value || '').toLowerCase().trim();

      var filtered = tftpAllFiles.filter(function (f) {
        var oltMatch = !oltFilter ||
          (f.olt_name || '').toLowerCase().indexOf(oltFilter) !== -1 ||
          (f.source_ip || '').toLowerCase().indexOf(oltFilter) !== -1 ||
          (f.olt_id || '').toLowerCase().indexOf(oltFilter) !== -1 ||
          (f.olt_mac || '').toLowerCase().replace(/:/g, '').indexOf(oltFilter.replace(/:/g, '')) !== -1;
        var fileMatch = !fileFilter ||
          (f.filename || '').toLowerCase().indexOf(fileFilter) !== -1 ||
          (f.stored_name || '').toLowerCase().indexOf(fileFilter) !== -1;
        return oltMatch && fileMatch;
      });

      buildTftpTable(filtered);

      var countEl = document.getElementById('tftpFilterCount');
      if (countEl) {
        if (oltFilter || fileFilter) {
          countEl.textContent = filtered.length + ' of ' + tftpAllFiles.length + ' shown';
          countEl.style.color = 'var(--accent2)';
        } else {
          countEl.textContent = '';
        }
      }
    }

    function clearTftpFilter() {
      document.getElementById('tftpFilterOlt').value = '';
      document.getElementById('tftpFilterFile').value = '';
      filterTftpTable();
    }

    function buildTftpTable(files) {
      var tb = document.getElementById('tftpFilesTable');
      tb.innerHTML = '';
      if (!files || !files.length) {
        tb.innerHTML = '<tr><td colspan="9"><div class="empty">No backup files received yet.<br>Configure your OLT TFTP target IP to point to this server on port <span id="tftpPortEmpty">69</span>.</div></td></tr>';
        return;
      }
      files.forEach(function (f) {
        var tr = document.createElement('tr');
        var dt = new Date(f.timestamp);
        var ok = f.status === 'ok';

        var cells = [
          { text: f.id, cls: 'mu' },
          {
            html: '<div class="mu" style="font-size:11px">' + dt.toLocaleDateString() + '</div>' +
              '<div class="mu" style="font-size:11px">' + dt.toLocaleTimeString() + '</div>'
          },
          { html: oltBadge(f.olt_name || f.source_ip) },
          { html: '<span class="mu" style="font-size:11px">' + (f.source_ip || 'â€”') + '</span>' },
          { html: '<span style="color:var(--accent3);font-family:monospace;font-size:11px">' + (f.filename || 'â€”') + '</span>' },
          { html: '<span style="color:var(--muted);font-size:10px">' + (f.stored_name || 'â€”') + '</span>' },
          { html: '<span style="color:var(--accent2)">' + formatBytes(f.file_size) + '</span>' },
          { html: ok ? '<span class="b bg">OK</span>' : '<span class="b br">' + f.status + '</span>' },
        ];

        cells.forEach(function (c) {
          var td = document.createElement('td');
          if (c.html !== undefined) td.innerHTML = c.html;
          else td.textContent = c.text;
          if (c.cls) td.className = c.cls;
          tr.appendChild(td);
        });

        // Action buttons
        var tdAct = document.createElement('td');
        tdAct.style.cssText = 'display:flex;gap:5px;padding:5px';

        if (ok) {
          var dlBtn = document.createElement('a');
          dlBtn.href = '/api/tftp/download/' + f.id;
          dlBtn.style.cssText = 'font-size:10px;padding:3px 8px;border:1px solid var(--accent);color:var(--accent);border-radius:3px;text-decoration:none';
          dlBtn.textContent = 'Download';
          tdAct.appendChild(dlBtn);
        }

        var delBtn = document.createElement('button');
        delBtn.className = 'dbtn';
        delBtn.style.cssText = 'font-size:10px;padding:3px 8px';
        delBtn.textContent = 'Delete';
        delBtn.onclick = (function (id) { return function () { deleteTftpFile(id); }; })(f.id);
        tdAct.appendChild(delBtn);

        tr.appendChild(tdAct);
        tb.appendChild(tr);
      });
    }

    function saveTftpConfig() {
      var d = {
        backup_dir: document.getElementById('tftpDir').value.trim(),
        enabled: document.getElementById('tftpEnabled').checked
      };
      if (!d.backup_dir) { showMsg('tftpCfgMsg', 'Backup path is required', false, true); return; }
      apiPost('/api/tftp/config', d).then(function (r) {
        if (r.success) {
          showMsg('tftpCfgMsg',
            'Saved! New path: ' + d.backup_dir + '\nRestart SimpleNOC for TFTP server to use new path.',
            true, true);
          var el = document.getElementById('tftpCfgMsg');
          if (el) { el.style.whiteSpace = 'pre'; el.style.fontFamily = 'monospace'; }
        } else {
          showMsg('tftpCfgMsg', 'Error: ' + (r.error || 'Failed'), false, true);
        }
      });
    }

    function deleteTftpFile(id) {
      if (!confirm('Delete this backup file? This cannot be undone.')) return;
      apiPost('/api/tftp/delete/' + id, {}).then(function () { loadTftp(); });
    }


    // â”€â”€ MAC MAPPING FUNCTIONS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    function toggleMacMapping() {
      var body = document.getElementById('macMappingBody');
      var arrow = document.getElementById('macMappingArrow');
      if (!body) return;
      var open = body.style.display !== 'none';
      body.style.display = open ? 'none' : 'block';
      arrow.style.transform = open ? '' : 'rotate(180deg)';
      if (!open) loadMacMapping();
    }

    function loadMacMapping() {
      // Populate hostname dropdown from syslog devices
      apiFetch('/api/tftp/syslog_devices').then(function (devs) {
        var sel = document.getElementById('macMapHost');
        if (!sel) return;
        sel.innerHTML = '<option value="">-- Select hostname --</option>';
        devs.forEach(function (d) {
          var opt = document.createElement('option');
          opt.value = d.olt_hostname;
          opt.textContent = (d.name || d.olt_hostname) + ' (' + (d.source_ip || '') + ')';
          sel.appendChild(opt);
        });
      }).catch(function () { });

      // Load existing mappings
      apiFetch('/api/tftp/mac_mapping').then(function (maps) {
        var tb = document.getElementById('macMappingTable');
        if (!tb) return;
        tb.innerHTML = '';
        var st = document.getElementById('macMappingStatus');
        if (st) st.textContent = maps.length + ' mapping' + (maps.length !== 1 ? 's' : '') + ' configured';
        if (!maps.length) {
          tb.innerHTML = '<tr><td colspan="5"><div class="empty">No MAC mappings yet. Add one above.</div></td></tr>';
          return;
        }
        maps.forEach(function (m) {
          var tr = document.createElement('tr');
          var dt = m.created_at ? new Date(m.created_at).toLocaleDateString() : 'â€”';
          var cells = [
            { html: '<span style="font-family:monospace;color:var(--accent2);font-size:12px">' + (m.olt_mac || 'â€”') + '</span>' },
            { html: oltBadge(m.olt_hostname) },
            { text: m.description || 'â€”' },
            { html: '<span class="mu" style="font-size:11px">' + dt + '</span>' },
          ];
          cells.forEach(function (c) {
            var td = document.createElement('td');
            if (c.html !== undefined) td.innerHTML = c.html;
            else td.textContent = c.text;
            tr.appendChild(td);
          });
          var tdAct = document.createElement('td');
          var del = document.createElement('button');
          del.className = 'dbtn';
          del.style.cssText = 'font-size:10px;padding:3px 8px';
          del.textContent = 'Delete';
          del.onclick = (function (mac) {
            return function () { deleteMacMapping(mac); };
          })(m.olt_mac);
          tdAct.appendChild(del);
          tr.appendChild(tdAct);
          tb.appendChild(tr);
        });
      }).catch(function () { });
    }

    function addMacMapping() {
      var mac = document.getElementById('macMapMac').value.trim();
      var host = document.getElementById('macMapHost').value.trim();
      var desc = document.getElementById('macMapDesc').value.trim();

      if (!mac) { showMsg('macMapMsg', 'MAC address is required', false, true); return; }
      if (!host) { showMsg('macMapMsg', 'Please select a hostname', false, true); return; }

      apiPost('/api/tftp/mac_mapping/add', { olt_mac: mac, olt_hostname: host, description: desc })
        .then(function (r) {
          if (r.success) {
            showMsg('macMapMsg', 'Mapping added: ' + r.mac + ' to ' + host, true, false);
            showMsg('macMapMsgOuter', 'Mapping added: ' + r.mac + ' to ' + host, true, false);
            document.getElementById('macMapMac').value = '';
            document.getElementById('macMapDesc').value = '';
            loadMacMapping();
            loadTftp();
          } else {
            showMsg('macMapMsg', 'Error: ' + (r.error || 'Failed'), false, true);
            showMsg('macMapMsgOuter', 'Error: ' + (r.error || 'Failed'), false, true);
          }
        }).catch(function (e) {
          showMsg('macMapMsg', 'Request failed: ' + e.message, false, true);
          showMsg('macMapMsgOuter', 'Request failed: ' + e.message, false, true);
        });
    }

    function deleteMacMapping(mac) {
      if (!confirm('Delete mapping for ' + mac + '?')) return;
      apiPost('/api/tftp/mac_mapping/delete', { olt_mac: mac })
        .then(function () { loadMacMapping(); });
    }


    // â”€â”€ OLT CONNECT FUNCTIONS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    var onuAllData = [];
    var currentOltIp = '';
    var currentOltName = '';
    window._allOltProfiles = [];
    var _oltSessions = [];
    var _oltSessionPage = 0;
    var _oltSessionPageSize = 10;
    var _lastUplinkStatsByProfile = {};
    var _lastUplinkHistorySelection = { profileId: '', port: '__saved__' };

    function loadOlt() {
      apiFetch('/api/olt/profiles').then(function (profiles) {
        window._allOltProfiles = profiles;
        document.getElementById('oltProfileCount').textContent = profiles.length;
        buildOltProfileTable(profiles);

        var uplinkSel = document.getElementById('oltUplinkOltSel');
        var dashUplinkSel = document.getElementById('dashUplinkOltSel');
        var jobSel = document.getElementById('oltJobProfileSel');

        if (uplinkSel) {
          var prevUplink = uplinkSel.value;
          uplinkSel.innerHTML = '<option value="">- select OLT -</option>';
          profiles.forEach(function (p) {
            var opt = document.createElement('option');
            opt.value = p.id;
            opt.textContent = (p.name || p.ip) + ' (' + p.ip + ')';
            if (String(p.id) === String(prevUplink)) opt.selected = true;
            uplinkSel.appendChild(opt);
          });
          if (!prevUplink || !profiles.find(function (p) { return String(p.id) === String(prevUplink); })) {
            document.getElementById('oltUplinkPortSel').innerHTML = '<option value="">- select OLT first -</option>';
            _currentUplinkProfile = null;
          } else {
            var activeUplinkProfile = profiles.find(function (p) { return String(p.id) === String(prevUplink); });
            if (activeUplinkProfile) {
              populateUplinkPortDropdown(activeUplinkProfile);
              restoreUplinkCardsForProfile(activeUplinkProfile.id);
              if (!_lastUplinkStatsByProfile[String(activeUplinkProfile.id)]) loadUplinkStats(activeUplinkProfile.ip);
            }
          }
        }

        if (dashUplinkSel) {
          var prevDash = dashUplinkSel.value;
          dashUplinkSel.innerHTML = '<option value="">- select OLT -</option>';
          profiles.forEach(function (p) {
            var opt = document.createElement('option');
            opt.value = p.id;
            opt.textContent = (p.name || p.ip) + ' (' + p.ip + ')';
            if (String(p.id) === String(prevDash)) opt.selected = true;
            dashUplinkSel.appendChild(opt);
          });
          if (prevDash && profiles.find(function (p) { return String(p.id) === String(prevDash); })) {
            onDashUplinkOltChange();
            if (_lastUplinkHistorySelection.port) {
              var dashPortSel = document.getElementById('dashUplinkPortSel');
              if (dashPortSel) dashPortSel.value = _lastUplinkHistorySelection.port;
            }
            onDashUplinkPortChange();
          }
        }

        if (jobSel) {
          var prevJob = jobSel.value;
          jobSel.innerHTML = '<option value="">- select OLT -</option>';
          profiles.forEach(function (p) {
            var opt = document.createElement('option');
            opt.value = p.id;
            opt.textContent = (p.name || p.ip) + ' (' + p.ip + ')';
            if (String(p.id) === String(prevJob)) opt.selected = true;
            jobSel.appendChild(opt);
          });
        }
      });

      apiFetch('/api/olt/sessions').then(function (sessions) {
        document.getElementById('oltSessionCount').textContent = sessions.length + ' sessions';
        buildOltSessionTable(sessions);
        var lastOk = sessions.find(function (s) { return s.status === 'ok'; });
        if (lastOk) {
          updateOltSnapshotSummary({
            poll_time: lastOk.poll_time,
            onu_count: lastOk.onu_count,
            online_count: lastOk.online_count
          });
        } else {
          updateOltSnapshotSummary({ poll_time: '', onu_count: 0, online_count: 0 });
        }
      });
      loadOltJobs();
    }

    function buildOltProfileTable(profiles) {
      var tb = document.getElementById('oltProfileTable');
      tb.innerHTML = '';
      if (!profiles.length) {
        tb.innerHTML = '<tr><td colspan="9"><div class="empty">No OLT profiles yet.</div></td></tr>';
        return;
      }
      profiles.forEach(function (p) {
        var tr = document.createElement('tr');
        var last = p.last_poll ? new Date(p.last_poll).toLocaleString() : 'Never';
        var stClr = p.last_status === 'ok' ? 'var(--accent3)' : p.last_status === 'never' ? 'var(--muted)' : 'var(--danger)';
        var connLabel = (p.conn_type || 'auto').toUpperCase();
        var modelLabel = (p.olt_model || 'V1600G1').toUpperCase();
        var uplinkDisplay = (p.uplink_ports || 'gigabitethernet 0/10');

        var cells = [
          { html: '<span style="color:var(--text);font-weight:700">' + (p.name || p.ip) + '</span>' },
          { html: '<span style="font-family:monospace;color:var(--accent)">' + p.ip + '</span>' },
          { html: '<span class="b bc" style="font-size:9px">' + connLabel + '</span>' },
          { html: '<span class="b bo" style="font-size:9px">' + modelLabel + '</span>' },
          { html: '<span class="mu">' + (p.username || 'â€”') + '</span>' },
          { html: '<span style="font-family:monospace;font-size:10px;color:var(--accent2)">' + uplinkDisplay + '</span>' },
          { html: '<span style="font-size:11px;color:var(--text)">' + last + '</span>' },
          { html: '<span style="font-size:11px;font-weight:700;color:' + stClr + '">' + (p.last_status || 'never').toUpperCase() + '</span>' },
        ];
        cells.forEach(function (c) {
          var td = document.createElement('td');
          td.innerHTML = c.html;
          tr.appendChild(td);
        });

        var tdAct = document.createElement('td');
        tdAct.style.cssText = 'display:flex;gap:4px;padding:6px;flex-wrap:wrap';

        // Get ONU Info button
        var onuBtn = document.createElement('button');
        onuBtn.className = 'rb';
        onuBtn.style.cssText = 'font-size:10px;padding:4px 9px;white-space:nowrap';
        onuBtn.textContent = 'Get ONU Info';
        onuBtn.onclick = (function (profile, b) {
          return function () { startOnuPoll(profile, b); };
        })(p, onuBtn);

        // View ONUs button
        var viewBtn = document.createElement('button');
        viewBtn.className = 'ubtn';
        viewBtn.style.cssText = 'font-size:10px;padding:4px 9px;white-space:nowrap';
        viewBtn.textContent = 'View ONUs';
        viewBtn.onclick = (function (ip, name) {
          return function () { openOnuModal(ip, name); };
        })(p.ip, p.name || p.ip);

        var editBtn = document.createElement('button');
        editBtn.className = 'ubtn';
        editBtn.style.cssText = 'font-size:10px;padding:4px 9px;white-space:nowrap';
        editBtn.textContent = 'Edit';
        editBtn.onclick = (function (profile) {
          return function () { beginOltEdit(profile); };
        })(p);

        // Delete button
        var delBtn = document.createElement('button');
        delBtn.className = 'dbtn';
        delBtn.style.cssText = 'font-size:10px;padding:4px 8px';
        delBtn.textContent = 'Del';
        delBtn.onclick = (function (id) {
          return function () { deleteOltProfile(id); };
        })(p.id);

        tdAct.appendChild(onuBtn);
        tdAct.appendChild(viewBtn);
        tdAct.appendChild(editBtn);
        tdAct.appendChild(delBtn);
        tr.appendChild(tdAct);
        tb.appendChild(tr);
      });
    }

    function resetOltProfileForm() {
      document.getElementById('oltEditId').value = '';
      document.getElementById('oltName').value = '';
      document.getElementById('oltIp').value = '';
      document.getElementById('oltSshPort').value = '22';
      document.getElementById('oltTelnetPort').value = '23';
      document.getElementById('oltConnMethod').value = 'auto';
      document.getElementById('oltModel').value = 'V1600G1';
      document.getElementById('oltUser').value = '';
      document.getElementById('oltPass').value = '';
      document.getElementById('oltEnablePass').value = '';
      document.getElementById('oltUplinkPorts').value = 'gigabitethernet 0/10';
      document.getElementById('oltProfileSaveBtn').textContent = '+ Add OLT Profile';
      document.getElementById('oltProfileCancelBtn').style.display = 'none';
    }

    function beginOltEdit(profile) {
      document.getElementById('oltEditId').value = profile.id || '';
      document.getElementById('oltName').value = profile.name || '';
      document.getElementById('oltIp').value = profile.ip || '';
      document.getElementById('oltSshPort').value = profile.ssh_port || '22';
      document.getElementById('oltTelnetPort').value = profile.telnet_port || '23';
      document.getElementById('oltConnMethod').value = profile.conn_type || 'auto';
      document.getElementById('oltModel').value = profile.olt_model || 'V1600G1';
      document.getElementById('oltUser').value = profile.username || '';
      document.getElementById('oltPass').value = '';
      document.getElementById('oltEnablePass').value = '';
      document.getElementById('oltUplinkPorts').value = profile.uplink_ports || 'gigabitethernet 0/10';
      document.getElementById('oltProfileSaveBtn').textContent = 'Update OLT Profile';
      document.getElementById('oltProfileCancelBtn').style.display = '';
      var body = document.getElementById('oltConfigBody');
      if (body) body.style.display = 'grid';
      var arrow = document.getElementById('oltConfigArrow');
      if (arrow) arrow.style.transform = 'rotate(180deg)';
      showMsg('oltProfileMsg', 'Editing ' + (profile.name || profile.ip) + '. Leave password fields blank to keep existing values, or enter new ones before Update.', true, true);
      var panel = document.getElementById('oltProfileConfigPanel');
      if (panel && panel.scrollIntoView) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function cancelOltEdit() {
      resetOltProfileForm();
      showMsg('oltProfileMsg', '', true, true);
      var el = document.getElementById('oltProfileMsg');
      if (el) el.style.display = 'none';
    }

    function buildOltSessionTable(sessions) {
      _oltSessions = Array.isArray(sessions) ? sessions.slice() : [];
      if (_oltSessionPage * _oltSessionPageSize >= _oltSessions.length) _oltSessionPage = 0;
      renderOltSessionPage();
    }

    function renderOltSessionPage() {
      var tb = document.getElementById('oltSessionTable');
      tb.innerHTML = '';
      if (!_oltSessions.length) {
        tb.innerHTML = '<tr><td colspan="8"><div class="empty">No polls yet.</div></td></tr>';
        updateOltSessionPager();
        return;
      }
      var start = _oltSessionPage * _oltSessionPageSize;
      var pageSessions = _oltSessions.slice(start, start + _oltSessionPageSize);
      pageSessions.forEach(function (s) {
        var tr = document.createElement('tr');
        tr.setAttribute('data-poll-time', s.poll_time || '');
        var stClr = s.status === 'ok' ? 'var(--accent3)' : 'var(--danger)';
        var totalOnus = Number(s.onu_count || 0);
        var onlineOnus = Number(s.online_count || 0);
        var offlineOnus = Math.max(0, totalOnus - onlineOnus);
        var cells = [
          { html: '<span style="font-size:11px;color:var(--text)">' + new Date(s.poll_time).toLocaleString() + '</span>' },
          { html: oltBadge(s.olt_name || s.olt_ip) },
          { html: '<span style="color:var(--muted)">' + (s.duration_s || 0) + 's</span>' },
          { html: '<span style="color:var(--text)">' + totalOnus + '</span>' },
          { html: '<span style="color:var(--accent3)">' + onlineOnus + '</span>' },
          { html: '<span style="color:var(--danger)">' + offlineOnus + '</span>' },
          { html: '<span style="color:var(--accent2);font-size:10px">' + (s.method || '?') + '</span>' },
          { html: '<span style="color:' + stClr + ';font-weight:700;font-size:10px">' + (s.status || '').toUpperCase() + '</span>' + (s.error ? '<div style="font-size:9px;color:var(--danger)">' + s.error + '</div>' : '') },
        ];
        cells.forEach(function (c) {
          var td = document.createElement('td'); td.innerHTML = c.html; tr.appendChild(td);
        });
        tb.appendChild(tr);
      });
      updateOltSessionPager();
    }

    function updateOltSessionPager() {
      var info = document.getElementById('oltSessionPageInfo');
      var prevBtn = document.getElementById('oltSessionPrevBtn');
      var nextBtn = document.getElementById('oltSessionNextBtn');
      var totalPages = Math.max(1, Math.ceil(_oltSessions.length / _oltSessionPageSize));
      if (info) info.textContent = 'Page ' + (totalPages ? (_oltSessionPage + 1) : 1) + ' / ' + totalPages;
      if (prevBtn) prevBtn.disabled = _oltSessionPage <= 0;
      if (nextBtn) nextBtn.disabled = (_oltSessionPage + 1) >= totalPages;
    }

    function changeOltSessionPage(delta) {
      var totalPages = Math.max(1, Math.ceil(_oltSessions.length / _oltSessionPageSize));
      var nextPage = _oltSessionPage + delta;
      if (nextPage < 0 || nextPage >= totalPages) return;
      _oltSessionPage = nextPage;
      renderOltSessionPage();
    }

    function cacheUplinkStats(profileId, stats, pollTime) {
      if (!profileId || !stats || !stats.length) return;
      _lastUplinkStatsByProfile[String(profileId)] = {
        stats: stats.slice(),
        pollTime: pollTime || (stats[0] && stats[0].poll_time) || ''
      };
    }

    function restoreUplinkCardsForProfile(profileId) {
      var cached = _lastUplinkStatsByProfile[String(profileId)];
      if (!cached || !cached.stats || !cached.stats.length) return;
      renderUplinkCards(cached.stats, cached.pollTime);
      document.getElementById('oltUplinkPanel').style.display = 'block';
      document.getElementById('oltUplinkSubtitle').textContent =
        'Last fetched: ' + new Date(cached.pollTime || cached.stats[0].poll_time).toLocaleString();
    }

    function updateOltSnapshotSummary(result) {
      var total = Number(result && result.onu_count || 0);
      var online = Number(result && result.online_count || 0);
      var offline = Math.max(0, total - online);
      document.getElementById('oltLastPoll').textContent = result && result.poll_time ? new Date(result.poll_time).toLocaleTimeString() : '?';
      document.getElementById('oltTotalOnus').textContent = total;
      document.getElementById('oltOnlineOnus').textContent = online;
      document.getElementById('oltOfflineOnus').textContent = offline;
    }

    function prependOltSession(result, profile) {
      if (!result || !result.poll_time) return;
      var latestSession = {
        poll_time: result.poll_time,
        olt_name: result.olt_name || (profile && (profile.name || profile.ip)) || '',
        olt_ip: (profile && profile.ip) || '',
        duration_s: result.duration || 0,
        onu_count: result.onu_count || 0,
        online_count: result.online_count || 0,
        method: result.method || '',
        status: result.success ? 'ok' : 'failed',
        error: result.error || ''
      };
      _oltSessions = [latestSession].concat(_oltSessions.filter(function (row) {
        return row.poll_time !== latestSession.poll_time;
      }));
      _oltSessionPage = 0;
      renderOltSessionPage();
      document.getElementById('oltSessionCount').textContent = _oltSessions.length + ' sessions';
    }

    function localDateTimeValue(offsetMinutes) {
      var dt = new Date(Date.now() + (offsetMinutes || 5) * 60000);
      dt.setSeconds(0, 0);
      var local = new Date(dt.getTime() - dt.getTimezoneOffset() * 60000);
      return local.toISOString().slice(0, 16);
    }

    function toggleOltConfigPanel() {
      var body = document.getElementById('oltConfigBody');
      var arrow = document.getElementById('oltConfigArrow');
      var open = body.style.display !== 'none';
      body.style.display = open ? 'none' : 'grid';
      arrow.textContent = open ? '?' : '?';
    }

    function toggleOltSchedulerPanel() {
      var body = document.getElementById('oltSchedulerBody');
      var arrow = document.getElementById('oltSchedulerArrow');
      var open = body.style.display !== 'none';
      body.style.display = open ? 'none' : 'grid';
      arrow.textContent = open ? '?' : '?';
    }

    function toggleOltJobMode() {
      var mode = document.getElementById('oltJobMode').value;
      document.getElementById('oltJobInterval').disabled = mode === 'once';
    }

    function toggleOltJobType() {
      var isUplink = document.getElementById('oltJobType').value === 'uplink';
      document.getElementById('oltJobPortsWrap').style.display = isUplink ? 'block' : 'none';
      updateOltJobPortOptions();
    }

    function updateOltJobPortOptions() {
      var sel = document.getElementById('oltJobPorts');
      var profileId = document.getElementById('oltJobProfileSel').value;
      if (!sel) return;
      sel.innerHTML = '<option value="">Saved profile ports</option>';
      if (!profileId) return;
      var profile = (window._allOltProfiles || []).find(function (p) { return String(p.id) === String(profileId); });
      if (!profile) return;
      var allPorts = [];
      for (var i = 1; i <= 16; i++) allPorts.push('gigabitethernet 0/' + i);
      var saved = (profile.uplink_ports || '').split(',').map(function (s) { return s.trim().toLowerCase(); }).filter(Boolean);
      saved.forEach(function (p) {
        if (allPorts.indexOf(p) === -1) allPorts.unshift(p);
      });
      allPorts.forEach(function (p) {
        var opt = document.createElement('option');
        opt.value = p;
        opt.textContent = p;
        sel.appendChild(opt);
      });
    }

    function loadOltJobs() {
      var startInput = document.getElementById('oltJobStartAt');
      if (startInput && !startInput.value) startInput.value = localDateTimeValue(5);
      toggleOltJobMode();
      toggleOltJobType();
      apiFetch('/api/olt/jobs').then(function (jobs) {
        var tb = document.getElementById('oltJobTable');
        if (!tb) return;
        tb.innerHTML = '';
        if (!jobs.length) {
          tb.innerHTML = '<tr><td colspan="8"><div class="empty">No automatic polls configured yet.</div></td></tr>';
          return;
        }
        jobs.forEach(function (j) {
          var tr = document.createElement('tr');
          var stClr = j.last_status === 'ok' ? 'var(--accent3)' : j.last_status === 'failed' ? 'var(--danger)' : 'var(--muted)';
          var pollLabel = (j.poll_type || '?').toUpperCase();
          if (j.poll_type === 'uplink' && j.selected_ports) pollLabel += '<div style="font-size:10px;color:var(--accent2)">' + j.selected_ports + '</div>';
          [
            (j.profile_name || j.profile_ip || '?'),
            pollLabel,
            j.run_mode === 'once' ? 'One Time' : ('Every ' + (j.interval_min || 0) + ' min'),
            j.start_at ? new Date(j.start_at).toLocaleString() : '?',
            j.next_run ? new Date(j.next_run).toLocaleString() : '?',
            j.last_run ? new Date(j.last_run).toLocaleString() : 'Never',
            '<span style="color:' + stClr + ';font-weight:700">' + (j.last_status || 'NEVER').toUpperCase() + '</span>' + (j.last_error ? '<div style="font-size:10px;color:var(--danger)">' + j.last_error + '</div>' : ''),
            '<button class="ubtn" style="padding:4px 9px;font-size:10px" onclick="toggleOltJob(' + j.id + ')">' + (j.enabled ? 'Pause' : 'Enable') + '</button> <button class="dbtn" style="padding:4px 9px;font-size:10px" onclick="deleteOltJob(' + j.id + ')">Delete</button>'
          ].forEach(function (html) {
            var td = document.createElement('td');
            td.innerHTML = html;
            tr.appendChild(td);
          });
          tb.appendChild(tr);
        });
      });
    }

    function addOltJob() {
      var body = {
        profile_id: document.getElementById('oltJobProfileSel').value,
        poll_type: document.getElementById('oltJobType').value,
        run_mode: document.getElementById('oltJobMode').value,
        start_at: document.getElementById('oltJobStartAt').value,
        interval_min: document.getElementById('oltJobInterval').value,
        selected_ports: document.getElementById('oltJobType').value === 'uplink' ? document.getElementById('oltJobPorts').value : ''
      };
      if (!body.profile_id) {
        showMsg('oltJobMsg', 'Select an OLT profile first.', false, true);
        return;
      }
      if (!body.start_at) body.start_at = localDateTimeValue(5);
      apiPost('/api/olt/jobs/add', body).then(function (r) {
        if (r.success) {
          showMsg('oltJobMsg', 'Automatic poll saved.', true, false);
          loadOltJobs();
        } else {
          showMsg('oltJobMsg', 'Error: ' + (r.error || 'Failed to save job'), false, true);
        }
      }).catch(function (e) {
        showMsg('oltJobMsg', 'Request failed: ' + e.message, false, true);
      });
    }

    function toggleOltJob(id) {
      apiPost('/api/olt/jobs/toggle', { id: id }).then(function (r) {
        if (r.success) loadOltJobs();
      });
    }

    function deleteOltJob(id) {
      if (!confirm('Delete this automatic poll?')) return;
      apiPost('/api/olt/jobs/delete', { id: id }).then(function (r) {
        if (r.success) loadOltJobs();
      });
    }

    function saveOltProfile() {
      var d = {
        id: document.getElementById('oltEditId').value.trim(),
        name: document.getElementById('oltName').value.trim(),
        ip: document.getElementById('oltIp').value.trim(),
        ssh_port: document.getElementById('oltSshPort').value.trim() || '22',
        telnet_port: document.getElementById('oltTelnetPort').value.trim() || '23',
        conn_type: document.getElementById('oltConnMethod').value || 'auto',
        olt_model: document.getElementById('oltModel').value || 'V1600G1',
        username: document.getElementById('oltUser').value.trim(),
        password: document.getElementById('oltPass').value,
        enable_pass: document.getElementById('oltEnablePass').value,
        uplink_ports: document.getElementById('oltUplinkPorts').value.trim() || 'gigabitethernet 0/10',
      };
      if (!d.ip || !d.username) {
        showMsg('oltProfileMsg', 'IP and username are required', false, true);
        return;
      }
      var isEdit = !!d.id;
      if (!isEdit && !d.password) {
        showMsg('oltProfileMsg', 'IP, username and password are required', false, true);
        return;
      }
      if (!d.enable_pass && d.password) d.enable_pass = d.password;
      var endpoint = isEdit ? '/api/olt/profiles/update' : '/api/olt/profiles/add';
      apiPost(endpoint, d).then(function (r) {
        if (r.success) {
          showMsg('oltProfileMsg', isEdit ? 'OLT profile updated!' : 'OLT profile added!', true, false);
          resetOltProfileForm();
          loadOlt();
        } else {
          showMsg('oltProfileMsg', 'Error: ' + (r.error || 'Failed'), false, true);
        }
      }).catch(function (e) {
        showMsg('oltProfileMsg', 'Request failed: ' + e.message, false, true);
      });
    }

    function deleteOltProfile(id) {
      if (!confirm('Delete this OLT profile?')) return;
      apiPost('/api/olt/profiles/delete', { id: id }).then(function () { loadOlt(); });
    }

    // â”€â”€ OLT POLL FUNCTIONS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    var _loadingTimer = null;
    var _activeConnBtn = null;
    var _oltProgressTimer = null;

    function showBtnLoading(btn, label) {
      _activeConnBtn = btn;
      btn.disabled = true;
      btn.dataset.origText = btn.textContent;
      var elapsed = 0;
      var lbl = label || 'Getting ONU info';
      btn.innerHTML = '<span class="btn-spinner"></span> ' + lbl + '...';
      _loadingTimer = setInterval(function () {
        elapsed++;
        btn.innerHTML = '<span class="btn-spinner"></span> ' + lbl + ' (' + elapsed + 's)...';
      }, 1000);
    }

    function stopOltProgressWatcher() {
      if (_oltProgressTimer) {
        clearInterval(_oltProgressTimer);
        _oltProgressTimer = null;
      }
    }

    function startOltProgressWatcher(profileId, pollLabel) {
      stopOltProgressWatcher();
      function tick() {
        apiFetch('/api/olt/poll_progress?id=' + encodeURIComponent(profileId)).then(function (p) {
          var stage = p.stage || pollLabel || 'Getting ONU info';
          var detail = p.detail ? ' — ' + p.detail : '';
          var msg = stage + detail;
          var isDone = p.done || p.stage === 'Completed' || p.stage === 'Failed';
          showMsg('oltProfileMsg', msg, !p.error, !isDone, !isDone);
          if (isDone) stopOltProgressWatcher();
        }).catch(function () { });
      }
      tick();
      _oltProgressTimer = setInterval(tick, 1000);
    }

    function hideBtnLoading() {
      if (_loadingTimer) { clearInterval(_loadingTimer); _loadingTimer = null; }
      stopOltProgressWatcher();
      if (_activeConnBtn) {
        _activeConnBtn.disabled = false;
        _activeConnBtn.innerHTML = _activeConnBtn.dataset.origText || 'Connect';
        _activeConnBtn = null;
      }
    }

    // Get ONU Info only
    function startOnuPoll(profile, btn) {
      showBtnLoading(btn, 'Getting ONU info');
      showMsg('oltProfileMsg', 'Getting ONU info: Connecting to ' + (profile.name || profile.ip) + '...', true, true, true);
      startOltProgressWatcher(profile.id, 'Getting ONU info');
      apiPost('/api/olt/poll_onu', { id: profile.id }).then(function (r) {
        hideBtnLoading();
        if (r.success) {
          showMsg('oltProfileMsg',
            'ONU data done: ' + r.onu_count + ' ONUs (' + r.online_count + ' online) via ' + r.method + ' in ' + r.duration + 's',
            true, false);
          updateOltSnapshotSummary(r);
          prependOltSession(r, profile);
          loadOlt();
          // Use the fresh response data directly â€” no DB re-fetch needed
          openOnuModalWithData(profile.ip, profile.name || profile.ip, r.onus, r.poll_time);
        } else {
          showMsg('oltProfileMsg', 'ONU fetch failed: ' + (r.error || 'Unknown error'), false, true);
        }
      }).catch(function (e) {
        hideBtnLoading();
        showMsg('oltProfileMsg', 'Error: ' + e.message, false, true);
      });
    }

    // Get Uplink Info â€” uses saved uplink_ports from profile, then opens panel
    function startUplinkPoll(profile, btn) {
      showBtnLoading(btn, 'Fetching Uplink');
      showMsg('oltProfileMsg', 'Fetching uplink traffic from ' + (profile.name || profile.ip) + '...', true, true);

      // Build dropdown of all 16 possible ports + the saved ports pre-selected
      populateUplinkPortDropdown(profile);

      var savedPorts = (profile.uplink_ports || 'gigabitethernet 0/10')
        .split(',').map(function (s) { return s.trim(); }).filter(Boolean);

      apiPost('/api/olt/poll_uplink', { id: profile.id, interfaces: savedPorts }).then(function (r) {
        hideBtnLoading();
        if (r.success) {
          cacheUplinkStats(profile.id, r.uplink_stats, r.poll_time);
          showMsg('oltProfileMsg',
            'Uplink done: ' + r.uplink_stats.length + ' interface(s) via ' + r.method + ' in ' + r.duration + 's',
            true, false);
          // Render directly from response â€” avoids stale DB data from another OLT
          renderUplinkCards(r.uplink_stats, r.poll_time);
          document.getElementById('oltUplinkSubtitle').textContent =
            (profile.name || profile.ip) + ' â€” via ' + r.method + ' in ' + r.duration + 's';
          document.getElementById('oltUplinkPanel').style.display = 'block';
          var dashOltSel = document.getElementById('dashUplinkOltSel');
          if (dashOltSel && String(dashOltSel.value) === String(profile.id)) {
            var dashPort = document.getElementById('dashUplinkPortSel').value || '__saved__';
            renderUplinkHistoryChart(r.uplink_stats, dashPort === '__saved__' ? '__saved__' : dashPort);
            loadUplinkHistory(profile.ip, dashPort);
          }
          document.getElementById('oltUplinkPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else {
          showMsg('oltProfileMsg', 'Uplink fetch failed: ' + (r.error || 'Unknown error'), false, true);
        }
      }).catch(function (e) {
        hideBtnLoading();
        showMsg('oltProfileMsg', 'Error: ' + e.message, false, true);
      });
    }

    // Keep old startOltPoll for backward compat (full poll)
    function startOltPoll(profile, btn) {
      showBtnLoading(btn, 'Connecting');
      showMsg('oltProfileMsg', 'Full poll: connecting to ' + (profile.name || profile.ip) + '...', true, true);
      startOltProgressWatcher(profile.id, 'Starting full poll');
      apiPost('/api/olt/poll', { id: profile.id }).then(function (r) {
        hideBtnLoading();
        if (r.success) {
          showMsg('oltProfileMsg',
            'Done: ' + r.onu_count + ' ONUs (' + r.online_count + ' online) via ' + r.method + ' in ' + r.duration + 's',
            true, false);
          updateOltSnapshotSummary(r);
          prependOltSession(r, profile);
          loadOlt();
          openOnuModalWithData(profile.ip, profile.name || profile.ip, r.onus, r.poll_time);
        } else {
          showMsg('oltProfileMsg', 'Failed: ' + (r.error || 'Unknown error'), false, true);
        }
      }).catch(function (e) {
        hideBtnLoading();
        showMsg('oltProfileMsg', 'Error: ' + e.message, false, true);
      });
    }

    // â”€â”€ UPLINK PORT DROPDOWN â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    var _currentUplinkProfile = null;

    function onUplinkOltChange() {
      var sel = document.getElementById('oltUplinkOltSel');
      var pid = sel.value;
      if (!pid) {
        document.getElementById('oltUplinkPortSel').innerHTML = '<option value="">â€” select OLT first â€”</option>';
        _currentUplinkProfile = null;
        document.getElementById('oltUplinkHistoryPanel').style.display = 'none';
        return;
      }
      var profile = window._allOltProfiles.find(function (p) { return String(p.id) === String(pid); });
      if (profile) {
        populateUplinkPortDropdown(profile);
        restoreUplinkCardsForProfile(profile.id);
        if (!_lastUplinkStatsByProfile[String(profile.id)]) loadUplinkStats(profile.ip);
      }
    }

    function populateUplinkPortDropdown(profile) {
      _currentUplinkProfile = profile;
      var sel = document.getElementById('oltUplinkPortSel');
      sel.innerHTML = '';

      // Ports 1â€“16 as gigabitethernet 0/N
      var allPorts = [];
      for (var i = 1; i <= 16; i++) {
        allPorts.push('gigabitethernet 0/' + i);
      }
      // Also include any custom saved ports not in the 1-16 range
      var saved = (profile.uplink_ports || '').split(',').map(function (s) { return s.trim().toLowerCase(); }).filter(Boolean);
      saved.forEach(function (s) {
        if (allPorts.indexOf(s) === -1) allPorts.unshift(s);
      });

      // Add "All saved ports" option at top
      var optAll = document.createElement('option');
      optAll.value = '__saved__';
      optAll.textContent = 'Saved ports: ' + (profile.uplink_ports || 'â€”');
      sel.appendChild(optAll);

      allPorts.forEach(function (p) {
        var opt = document.createElement('option');
        opt.value = p;
        opt.textContent = p;
        sel.appendChild(opt);
      });
    }

    function onUplinkPortChange() {
      if (!_currentUplinkProfile) return;
      var sel = document.getElementById('oltUplinkPortSel');
      var val = sel.value;
      if (!val) return;
      var interfaces = val === '__saved__'
        ? (_currentUplinkProfile.uplink_ports || 'gigabitethernet 0/10').split(',').map(function (s) { return s.trim(); }).filter(Boolean)
        : [val];

      // Also trigger history view immediately for the selected item
      loadUplinkHistory(_currentUplinkProfile.ip, val);

      // Fire live fetch for the selected port
      var btn = document.getElementById('uplinkRefreshBtn');
      if (btn) { btn.disabled = true; btn.textContent = 'Fetching...'; }
      apiPost('/api/olt/poll_uplink', { id: _currentUplinkProfile.id, interfaces: interfaces }).then(function (r) {
        if (btn) { btn.disabled = false; btn.textContent = 'â†» Refresh'; }
        if (r.success) {
          cacheUplinkStats(_currentUplinkProfile.id, r.uplink_stats, r.poll_time);
          renderUplinkCards(r.uplink_stats, r.poll_time);
          document.getElementById('oltUplinkSubtitle').textContent =
            'Fetched: ' + interfaces.join(', ') + ' â€” ' + r.duration + 's via ' + r.method;
          // Also refresh the dashboard history chart if it's viewing this OLT
          var dashOlt = document.getElementById('dashUplinkOltSel').value;
          if (dashOlt && String(dashOlt) === String(_currentUplinkProfile.id)) {
             renderUplinkHistoryChart(r.uplink_stats, val === '__saved__' ? '__saved__' : val);
             loadUplinkHistory(_currentUplinkProfile.ip, val);
          }
        } else {
          document.getElementById('oltUplinkSubtitle').textContent = 'Error: ' + (r.error || 'Failed');
        }
      }).catch(function (e) {
        if (btn) { btn.disabled = false; btn.textContent = 'â†» Refresh'; }
      });
    }

    function refreshSelectedUplink() {
      onUplinkPortChange();
    }

    function clearUplinkCards() {
      var cards = document.getElementById('oltUplinkCards');
      if (cards) cards.innerHTML = '<div class="empty" style="padding:20px;grid-column:1/-1">Select an OLT and Port above to view uplink traffic.</div>';
      document.getElementById('oltUplinkSubtitle').textContent = 'Select an OLT and Port to fetch traffic';
    }

    function onDashUplinkOltChange() {
      var sel = document.getElementById('dashUplinkOltSel');
      var pid = sel.value;
      var pSel = document.getElementById('dashUplinkPortSel');
      if (!pid) {
        pSel.innerHTML = '<option value="">â€” select OLT first â€”</option>';
        return;
      }
      var profile = (window._allOltProfiles || []).find(function (p) { return String(p.id) === String(pid); });
      if (!profile) return;
      
      var allPorts = [];
      for (var i = 1; i <= 16; i++) allPorts.push('gigabitethernet 0/' + i);
      var saved = (profile.uplink_ports || '').split(',').map(function (s) { return s.trim().toLowerCase(); }).filter(Boolean);
      saved.forEach(function (p) {
        if (allPorts.indexOf(p) === -1) allPorts.unshift(p);
      });
      var html = '<option value="__saved__">All Saved Ports</option>';
      allPorts.forEach(function (p) { html += '<option value="' + p + '">' + p + '</option>'; });
      pSel.innerHTML = html;
      onDashUplinkPortChange();
    }

    function onDashUplinkPortChange() {
      var oSel = document.getElementById('dashUplinkOltSel');
      var pSel = document.getElementById('dashUplinkPortSel');
      var pid = oSel.value;
      var port = pSel.value;
      if (!pid || !port) return;
      _lastUplinkHistorySelection = { profileId: String(pid), port: port };
      var profile = (window._allOltProfiles || []).find(p => String(p.id) === String(pid));
      if (profile) {
        loadUplinkHistory(profile.ip, port);
      }
    }

    function onDashUplinkRangeChange() {
      onDashUplinkPortChange();
    }

    var _uplinkChart = null;
    function loadUplinkHistory(ip, iface) {
      if (!ip) return;
      var rangeSel = document.getElementById('dashUplinkRangeSel');
      var range = rangeSel ? rangeSel.value : 'last5';
      var url = '';
      if (range === 'day' || range === 'week' || range === 'month') {
        url = '/api/olt/uplink_aggregate?ip=' + encodeURIComponent(ip) + '&range=' + encodeURIComponent(range);
        if (iface && iface !== '__saved__') url += '&interface=' + encodeURIComponent(iface);
      } else {
        url = '/api/olt/uplink_stats?ip=' + encodeURIComponent(ip) + '&limit=5';
        if (iface && iface !== '__saved__') url += '&interface=' + encodeURIComponent(iface);
      }

      console.log("[History] Fetching:", url);
      apiFetch(url).then(function (stats) {
        console.log("[History] Received samples:", stats.length);
        renderUplinkHistoryChart(stats, iface);
      }).catch(function (e) { console.error('History error:', e); });
    }

    // ?????? ONU MODAL â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    function openOnuModal(ip, name) {
      currentOltIp = ip;
      currentOltName = name || ip;
      document.getElementById('onuModalTitle').textContent = (name || ip) + ' â€” ONU Data';
      document.getElementById('onuModalSubtitle').textContent = 'Loading...';
      document.getElementById('onuModal').style.display = 'block';
      document.body.style.overflow = 'hidden';
      loadOnuHistoryControls(ip).then(function () {
        loadOnuData(ip);
      });
    }

    // Opens the modal with data already in hand â€” used by "Get ONU Info" button
    // to avoid a DB round-trip and guarantee the freshest rx_power values show up
    function openOnuModalWithData(ip, name, onus, poll_time) {
      currentOltIp = ip;
      currentOltName = name || ip;
      document.getElementById('onuModalTitle').textContent = (name || ip) + ' â€” ONU Data';
      document.getElementById('onuModal').style.display = 'block';
      document.body.style.overflow = 'hidden';
      loadOnuHistoryControls(ip, poll_time);
      populateOnuModal(onus, poll_time, ip);
    }

    function closeOnuModal() {
      document.getElementById('onuModal').style.display = 'none';
      document.body.style.overflow = '';
    }

    function loadOnuData(ip) {
      var pollTime = document.getElementById('onuPollTime').value;
      var url = '/api/olt/onus?ip=' + encodeURIComponent(ip);
      if (pollTime) url += '&poll_time=' + encodeURIComponent(pollTime);
      apiFetch(url).then(function (onus) {
        var poll_time = onus.length ? onus[0].poll_time : null;
        populateOnuModal(onus, poll_time, ip);
      });
    }

    function loadOnuHistoryControls(ip, selectedPollTime) {
      return apiFetch('/api/olt/poll_dates?ip=' + encodeURIComponent(ip) + '&limit=180').then(function (dates) {
        var dateInput = document.getElementById('onuPollDate');
        if (!dates || !dates.length) {
          dateInput.value = '';
          return populateOnuPollTimeOptions(ip, '', selectedPollTime);
        }
        var selectedDate = selectedPollTime
          ? selectedPollTime.slice(0, 10)
          : (dateInput.value || dates[0].poll_date);
        dateInput.value = selectedDate;
        return populateOnuPollTimeOptions(ip, selectedDate, selectedPollTime);
      }).catch(function () {
        return populateOnuPollTimeOptions(ip, '', selectedPollTime);
      });
    }

    function populateOnuPollTimeOptions(ip, pollDate, selectedPollTime) {
      var sel = document.getElementById('onuPollTime');
      var url = '/api/olt/poll_times?ip=' + encodeURIComponent(ip) + '&limit=100';
      if (pollDate) url += '&date=' + encodeURIComponent(pollDate);
      return apiFetch(url).then(function (times) {
        times = times || [];
        sel.innerHTML = '<option value="">Latest Poll Snapshot</option>';
        times.forEach(function (row, idx) {
          var opt = document.createElement('option');
          opt.value = row.poll_time;
          var label = new Date(row.poll_time).toLocaleString();
          if (idx === 0) label += ' (Latest)';
          opt.textContent = label;
          if (selectedPollTime && row.poll_time === selectedPollTime) opt.selected = true;
          sel.appendChild(opt);
        });
        if (selectedPollTime && !times.some(function (row) { return row.poll_time === selectedPollTime; })) {
          var opt = document.createElement('option');
          opt.value = selectedPollTime;
          opt.textContent = new Date(selectedPollTime).toLocaleString();
          opt.selected = true;
          sel.appendChild(opt);
        }
        return times;
      }).catch(function () {
        sel.innerHTML = '<option value="">Latest Poll Snapshot</option>';
        return [];
      });
    }

    function onOnuPollDateChange() {
      if (!currentOltIp) return;
      var pollDate = document.getElementById('onuPollDate').value;
      populateOnuPollTimeOptions(currentOltIp, pollDate, '').then(function () {
        loadSelectedOnuSnapshot();
      });
    }

    function onOnuPollTimeChange() {
      if (!currentOltIp) return;
      loadSelectedOnuSnapshot();
    }

    function loadSelectedOnuSnapshot() {
      if (!currentOltIp) return;
      document.getElementById('onuModalSubtitle').textContent = 'Loading selected snapshot...';
      loadOnuData(currentOltIp);
    }

    function populateOnuModal(onus, poll_time, ip) {
      onuAllData = onus;

      // Populate PON filter
      var pons = {};
      onus.forEach(function (o) { pons[o.pon_port] = (pons[o.pon_port] || 0) + 1; });
      var ponSel = document.getElementById('onuPonFilter');
      ponSel.innerHTML = '<option value="">All PON Ports (' + onus.length + ')</option>';
      Object.keys(pons).sort(function (a, b) { return parseInt(a) - parseInt(b); }).forEach(function (p) {
        var opt = document.createElement('option');
        opt.value = p; opt.textContent = 'PON ' + p + ' (' + pons[p] + ' ONUs)';
        ponSel.appendChild(opt);
      });

      if (onus.length && poll_time) {
        var pt = new Date(poll_time);
        document.getElementById('onuModalSubtitle').textContent =
          'Last polled: ' + pt.toLocaleString() + ' â€” ' + onus.length + ' ONUs';
        document.getElementById('onuModalFooter').textContent =
          'Poll time: ' + poll_time + ' | OLT: ' + (onus[0].olt_name || ip);
        document.getElementById('onuPollDate').value = poll_time.slice(0, 10);
        var pollSel = document.getElementById('onuPollTime');
        if (pollSel && poll_time) {
          var found = Array.prototype.some.call(pollSel.options, function (opt) {
            return opt.value === poll_time;
          });
          if (!found) {
            var opt = document.createElement('option');
            opt.value = poll_time;
            opt.textContent = pt.toLocaleString();
            pollSel.appendChild(opt);
          }
          pollSel.value = poll_time;
        }
      } else {
        document.getElementById('onuModalSubtitle').textContent = 'No data â€” click Connect to poll this OLT';
        document.getElementById('onuModalFooter').textContent = '';
      }
      filterOnuTable();
    }

    function filterOnuTable() {
      var ponFilter = document.getElementById('onuPonFilter').value;
      var stateFilter = document.getElementById('onuStateFilter').value;
      var search = (document.getElementById('onuSearch').value || '').toLowerCase();

      var filtered = onuAllData.filter(function (o) {
        if (ponFilter && o.pon_port !== ponFilter) return false;
        if (stateFilter !== '' && String(o.online) !== stateFilter) return false;
        if (search && (o.serial_no || '').toLowerCase().indexOf(search) === -1 &&
          (o.model || '').toLowerCase().indexOf(search) === -1 &&
          (o.onu_index || '').toLowerCase().indexOf(search) === -1) return false;
        return true;
      });

      buildOnuTable(filtered);

      // Stats
      var total = filtered.length;
      var online = filtered.filter(function (o) { return o.online; }).length;
      var offline = filtered.filter(function (o) { return !o.online && (o.phase_state || '').toLowerCase() !== 'dyinggasp'; }).length;
      var gasp = filtered.filter(function (o) { return (o.phase_state || '').toLowerCase() === 'dyinggasp'; }).length;

      document.getElementById('onuStatTotal').textContent = total;
      document.getElementById('onuStatOnline').textContent = online;
      document.getElementById('onuStatOffline').textContent = offline;
      document.getElementById('onuStatGasp').textContent = gasp;

      // Farthest
      var withDist = filtered.filter(function (o) { return o.distance_m !== null && o.distance_m !== undefined; });
      if (withDist.length) {
        var farthest = withDist.reduce(function (a, b) { return (a.distance_m || 0) > (b.distance_m || 0) ? a : b; });
        document.getElementById('onuStatFarthest').textContent =
          farthest.onu_index + ' â€” ' + farthest.distance_m + 'm';
      } else {
        document.getElementById('onuStatFarthest').textContent = 'N/A';
      }

      // Weakest signal
      var withPow = filtered.filter(function (o) { return o.rx_power !== null && o.rx_power !== undefined; });
      if (withPow.length) {
        var weakest = withPow.reduce(function (a, b) { return (a.rx_power || 0) < (b.rx_power || 0) ? a : b; });
        document.getElementById('onuStatWeakest').textContent =
          weakest.onu_index + ' â€” ' + weakest.rx_power + ' dBm';
      } else {
        document.getElementById('onuStatWeakest').textContent = 'N/A';
      }
    }

    function buildOnuTable(onus) {
      var tb = document.getElementById('onuTableBody');
      tb.innerHTML = '';
      if (!onus.length) {
        var tr = document.createElement('tr');
        var td = document.createElement('td'); td.colSpan = 11;
        td.innerHTML = '<div class="empty">No ONU data matching filter.</div>';
        tr.appendChild(td); tb.appendChild(tr);
        return;
      }

      onus.forEach(function (o) {
        var tr = document.createElement('tr');
        var online = o.online;
        var state = (o.phase_state || '').toLowerCase();
        var stClr = online ? 'var(--accent3)' : state === 'dyinggasp' ? 'var(--warn)' : 'var(--danger)';
        var stText = online ? 'Online' : state === 'dyinggasp' ? 'Dying Gasp' : (o.phase_state || 'Offline');

        function rxColor(v) {
          if (v === null || v === undefined) return 'var(--muted)';
          if (v >= -20) return 'var(--accent3)';
          if (v >= -25) return 'var(--warn)';
          return 'var(--danger)';
        }

        var cells = [
          {
            html: '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + stClr + ';margin-right:5px;vertical-align:middle"></span>' +
              '<span style="font-size:11px;font-weight:700;color:' + stClr + '">' + stText + '</span>'
          },
          { html: '<span style="font-family:monospace;color:var(--accent);font-size:12px">' + (o.onu_index || 'â€”') + '</span>' },
          { html: '<span style="color:var(--text)">PON ' + (o.pon_port || 'â€”') + '</span>' },
          { html: '<span style="color:var(--text)">' + (o.onu_id || 'â€”') + '</span>' },
          { html: '<span style="font-family:monospace;color:var(--accent2);font-size:11px">' + (o.serial_no || 'â€”') + '</span>' },
          { html: '<span style="color:var(--text)">' + (o.model || 'unknown') + '</span>' },
          { html: '<span class="mu">' + (o.profile || 'â€”') + '</span>' },
          {
            html: o.rx_power !== null && o.rx_power !== undefined
              ? '<span style="font-family:monospace;font-weight:700;color:' + rxColor(o.rx_power) + '">' + o.rx_power.toFixed(1) + ' dBm</span>'
              : '<span class="mu">â€”</span>'
          },
          {
            html: o.tx_power !== null && o.tx_power !== undefined
              ? '<span style="font-family:monospace;color:var(--text)">' + o.tx_power.toFixed(1) + ' dBm</span>'
              : '<span class="mu">â€”</span>'
          },
          {
            html: (o.distance_m !== null && o.distance_m !== undefined)
              ? '<span style="font-family:monospace;color:var(--accent2)">' + o.distance_m.toLocaleString() + ' m</span>'
              : '<span class="mu">â€”</span>'
          },
          { html: '<span style="font-size:10px;color:' + stClr + '">' + (o.phase_state || 'â€”') + '</span>' },
        ];

        cells.forEach(function (c) {
          var td = document.createElement('td'); td.innerHTML = c.html; tr.appendChild(td);
        });
        tb.appendChild(tr);
      });
    }

    function exportOnuCsv() {
      if (!onuAllData.length) return;
      var headers = ['ONU Index', 'PON Port', 'ONU ID', 'Serial No', 'Model', 'Profile', 'Rx Power (dBm)', 'Tx Power (dBm)', 'Distance (m)', 'State', 'Online'];
      var rows = onuAllData.map(function (o) {
        return [
          o.onu_index, o.pon_port, o.onu_id, o.serial_no, o.model, o.profile,
          o.rx_power !== null ? o.rx_power : '',
          o.tx_power !== null ? o.tx_power : '',
          o.distance_m || '',
          o.phase_state,
          o.online ? 'Yes' : 'No'
        ].join(',');
      });
      var csv = [headers.join(',')].concat(rows).join('\n');
      var blob = new Blob([csv], { type: 'text/csv' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url; a.download = 'onu_data_' + currentOltIp + '.csv';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }

    // Close modal on backdrop click
    document.addEventListener('click', function (e) {
      var modal = document.getElementById('onuModal');
      if (e.target === modal) closeOnuModal();
    });


    function loadUplinkStats(ip) {
      apiFetch('/api/olt/uplink_latest?ip=' + encodeURIComponent(ip)).then(function (stats) {
        if (!stats.length) {
          return;
        }
        var profile = (window._allOltProfiles || []).find(function (p) { return p.ip === ip; });
        if (profile) cacheUplinkStats(profile.id, stats, stats[0].poll_time);
        document.getElementById('oltUplinkSubtitle').textContent =
          'Last fetched: ' + new Date(stats[0].poll_time).toLocaleString();
        renderUplinkCards(stats, stats[0].poll_time);
      }).catch(function () { });
    }

    function renderUplinkCards(stats, pollTime) {
      var cards = document.getElementById('oltUplinkCards');
      if (!stats || !stats.length) {
        if (!cards.children.length || cards.querySelector('.empty')) {
            cards.innerHTML = '<div class="empty" style="padding:20px">No data returned for this interface.</div>';
        }
        return;
      }
      
      // Remove empty placeholder if it exists
      var emptyMsg = cards.querySelector('.empty');
      if (emptyMsg) emptyMsg.remove();

      stats.forEach(function (s) {
        if (!s || !s.olt_ip || !s.interface) return;
        var cardId = 'uplink-card-' + s.olt_ip.replace(/\./g, '-') + '-' + s.interface.replace(/\s+/g, '-').replace(/\//g, '-');
        var card = document.getElementById(cardId);
        var isNew = false;
        if (!card) {
          card = document.createElement('div');
          card.id = cardId;
          isNew = true;
        }
        card.className = 'uplink-card';
        card.style.cssText = 'background:rgba(0,0,0,0.2);border:1px solid var(--border);border-radius:8px;padding:16px;position:relative';

        var stClr = s.link_status === 'up' ? 'var(--accent3)' : s.link_status === 'down' ? 'var(--danger)' : 'var(--muted)';

        var hdr = document.createElement('div');
        hdr.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:12px';
        hdr.innerHTML =
          '<div>' +
          '<div class="uplink-meta uplink-meta--title">' + (s.olt_name || s.olt_ip) + '</div>' +
          '<div style="font-size:14px;font-weight:700;color:var(--accent);font-family:monospace">' + (s.description || s.interface) + '</div>' +
          '<div class="uplink-meta uplink-meta--detail">' + (s.description ? s.interface + (s.link_speed ? ' | ' + s.link_speed : '') : (s.link_speed || '')) + '</div>' +
          '</div>' +
          '<span style="font-size:12px;font-weight:700;color:' + stClr + ';padding:4px 11px;border:1px solid ' + stClr + ';border-radius:10px;height:fit-content">' +
          (s.link_status || 'unknown').toUpperCase() + '</span>';
        
        card.innerHTML = ''; // Fresh rebuild of internal card DOM
        card.appendChild(hdr);

        var grid = document.createElement('div');
        grid.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px';

        function makeTrafficBox(label, mbps, bps, pkts, color) {
          var box = document.createElement('div');
          box.style.cssText = 'background:rgba(0,0,0,0.25);border-radius:6px;padding:12px 10px;text-align:center';
          var lbl = document.createElement('div');
          lbl.className = 'uplink-traffic-label';
          lbl.textContent = label;
          var val = document.createElement('div');
          val.style.cssText = 'font-size:20px;font-weight:700;color:' + color + ';font-family:monospace;line-height:1';
          val.textContent = mbps >= 1000 ? (mbps / 1000).toFixed(2) + ' Gbps' : (mbps || 0).toFixed(2) + ' Mbps';
          var b2 = document.createElement('div');
          b2.className = 'uplink-traffic-sub';
          b2.textContent = (bps || 0).toLocaleString() + ' bps';
          var p2 = document.createElement('div');
          p2.className = 'uplink-traffic-sub tight';
          p2.textContent = (pkts || 0).toLocaleString() + ' pkts';
          box.appendChild(lbl); box.appendChild(val); box.appendChild(b2); box.appendChild(p2);
          return box;
        }

        grid.appendChild(makeTrafficBox('IN', s.in_mbps || 0, s.in_bps, s.in_pkts, 'var(--accent3)'));
        grid.appendChild(makeTrafficBox('OUT', s.out_mbps || 0, s.out_bps, s.out_pkts, 'var(--accent2)'));
        card.appendChild(grid);

        if (s.in_errors || s.out_errors) {
          var errRow = document.createElement('div');
          errRow.style.cssText = 'font-size:12px;color:var(--danger);padding:5px 0;font-family:\'Share Tech Mono\',monospace';
          errRow.textContent = 'Errors â€” In: ' + (s.in_errors || 0) + '  Out: ' + (s.out_errors || 0);
          card.appendChild(errRow);
        }

        var sampledAt = new Date(s.poll_time || pollTime);
        var sampledStr = isNaN(sampledAt.getTime()) ? 'â€”' : sampledAt.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'medium' });
        var ts = document.createElement('div');
        ts.className = 'uplink-foot';
        ts.innerHTML = '<span>Sampled: ' + sampledStr + '</span>' +
                       '<span style="cursor:pointer;color:var(--danger);font-weight:600" onclick="this.closest(\'.uplink-card\').remove()">[Remove]</span>';
        card.appendChild(ts);

        if (isNew) cards.appendChild(card);
      });
    }

    function renderUplinkHistoryChart(stats, iface) {
      var title = document.getElementById('dashUplinkHistoryTitle');
      var insight = document.getElementById('dashUplinkHistoryInsight');
      if (!stats.length) {
        title.textContent = 'No history for ' + (iface === '__saved__' ? 'all ports' : iface) + ' - poll it in OLT Connect tab first.';
        if (insight) insight.textContent = '';
        if (_uplinkChart) _uplinkChart.destroy();
        _uplinkChart = null;
        return;
      }

      title.textContent = (iface === '__saved__' ? 'All Ports' : iface) + ' - Last ' + stats.length + ' points';

      var hist = stats.slice().reverse();
      var labels = hist.map(function (h) { return new Date(h.poll_time).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' }); });
      var portList = [...new Set(hist.map(function (h) { return h.interface; }))];
      var peakIn = Math.max.apply(null, hist.map(function (h) { return Number(h.in_mbps || 0); }));
      var peakOut = Math.max.apply(null, hist.map(function (h) { return Number(h.out_mbps || 0); }));
      var lowIn = Math.min.apply(null, hist.map(function (h) { return Number(h.in_mbps || 0); }));
      var lowOut = Math.min.apply(null, hist.map(function (h) { return Number(h.out_mbps || 0); }));
      if (insight) {
        insight.textContent = 'Peak IN ' + peakIn.toFixed(2) + ' Mbps | Peak OUT ' + peakOut.toFixed(2) + ' Mbps | Low IN ' + lowIn.toFixed(2) + ' Mbps | Low OUT ' + lowOut.toFixed(2) + ' Mbps';
      }

      var colors = ['#00e5ff', '#ff6b35', '#39ff14', '#ffd60a', '#ff2d55', '#9d50bb'];
      var datasets = [];

      portList.forEach(function (pname, idx) {
        var pData = hist.filter(function (h) { return h.interface === pname; });
        var color = colors[idx % colors.length];
        datasets.push({
          label: pname + ' IN (Mbps)',
          data: pData.map(function (h) { return h.in_mbps; }),
          borderColor: color,
          backgroundColor: color,
          tension: 0.3,
          fill: false,
          borderWidth: 2,
          pointRadius: 3,
          pointHoverRadius: 5
        });
        datasets.push({
          label: pname + ' OUT (Mbps)',
          data: pData.map(function (h) { return h.out_mbps; }),
          borderColor: color,
          borderDash: [5, 5],
          backgroundColor: 'transparent',
          tension: 0.3,
          fill: false,
          borderWidth: 1,
          pointRadius: 0
        });
      });

      if (_uplinkChart) _uplinkChart.destroy();
      var ctx = document.getElementById('dashUplinkHistoryChart').getContext('2d');
      _uplinkChart = new Chart(ctx, {
        type: 'line',
        data: { labels: labels, datasets: datasets },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: { duration: 400 },
          interaction: { intersect: false, mode: 'index' },
          scales: {
            x: { ticks: { color: getChartTheme().tick, font: { size: 10 } }, grid: { color: document.body.classList.contains('light-mode') ? 'rgba(20,50,75,0.12)' : 'rgba(255,255,255,0.06)' } },
            y: { beginAtZero: true, ticks: { color: getChartTheme().tick, font: { size: 10 } }, grid: { color: document.body.classList.contains('light-mode') ? 'rgba(20,50,75,0.12)' : 'rgba(255,255,255,0.06)' } }
          },
          plugins: {
            legend: { position: 'bottom', labels: { color: getChartTheme().legend, boxWidth: 10, font: { size: 10 } } },
            tooltip: { backgroundColor: 'rgba(0,0,0,0.8)', titleFont: { size: 11 }, bodyFont: { size: 11 } }
          }
        }
      });
      applyChartsTheme();
    }


    // â”€â”€ THEME TOGGLE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    function toggleTheme() {
      var body = document.body;
      var btn = document.getElementById('themeToggleBtn');
      if (body.classList.contains('light-mode')) {
        body.classList.remove('light-mode');
        if (btn) btn.textContent = 'â˜€ Light';
        try { localStorage.setItem('noc_theme', 'dark'); } catch (e) { }
      } else {
        body.classList.add('light-mode');
        if (btn) btn.textContent = 'ðŸŒ™ Dark';
        try { localStorage.setItem('noc_theme', 'light'); } catch (e) { }
      }
      applyChartsTheme();
    }

    function loadTheme() {
      try {
        var saved = localStorage.getItem('noc_theme');
        if (saved === 'light') {
          document.body.classList.add('light-mode');
          var btn = document.getElementById('themeToggleBtn');
          if (btn) btn.textContent = 'ðŸŒ™ Dark';
        }
      } catch (e) { }
    }

    function getChartTheme() {
      if (document.body.classList.contains('light-mode')) {
        return { tick: '#64748b', grid: '#e2e8f0', legend: '#0f172a' };
      }
      return { tick: '#7a9aad', grid: '#0f2a3f', legend: '#cde8f5' };
    }

    function applyChartsTheme() {
      var th = getChartTheme();
      function applyXY(chart) {
        if (!chart || !chart.options || !chart.options.scales) return;
        ['x', 'y'].forEach(function (ax) {
          var sc = chart.options.scales[ax];
          if (!sc) return;
          if (sc.ticks) sc.ticks.color = th.tick;
          if (sc.grid) sc.grid.color = th.grid;
        });
        chart.update('none');
      }
      if (barChart) applyXY(barChart);
      if (lineChart) applyXY(lineChart);
      if (sysEventChart) applyXY(sysEventChart);
      if (pingHistChart) applyXY(pingHistChart);
      if (sysSevChart && sysSevChart.options.plugins && sysSevChart.options.plugins.legend) {
        sysSevChart.options.plugins.legend.labels.color = th.tick;
        sysSevChart.update('none');
      }
      if (_uplinkChart && _uplinkChart.options && _uplinkChart.options.scales) {
        applyXY(_uplinkChart);
        if (_uplinkChart.options.plugins && _uplinkChart.options.plugins.legend) {
          _uplinkChart.options.plugins.legend.labels.color = th.legend;
          _uplinkChart.update('none');
        }
      }
      applyDashboardChartsTheme();
    }

    function initCharts() {
      var ct = getChartTheme();
      initDashboardCharts();
      var bo = {
        responsive: true, animation: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { color: ct.grid }, ticks: { color: ct.tick, maxTicksLimit: 8 } },
          y: { grid: { color: ct.grid }, ticks: { color: ct.tick, maxTicksLimit: 6 }, beginAtZero: true }
        }
      };
      barChart = new Chart(document.getElementById('barChart'), {
        type: 'bar',
        data: { labels: [], datasets: [{ data: [], backgroundColor: 'rgba(0,229,255,0.2)', borderColor: '#00e5ff', borderWidth: 1, borderRadius: 4 }] },
        options: bo
      });
      lineChart = new Chart(document.getElementById('lineChart'), {
        type: 'line',
        data: { labels: [], datasets: [{ data: [], borderColor: '#39ff14', backgroundColor: 'rgba(57,255,20,0.06)', borderWidth: 2, pointRadius: 2, tension: 0.4, fill: true }] },
        options: bo
      });
      sysEventChart = new Chart(document.getElementById('sysEventChart'), {
        type: 'bar',
        data: { labels: [], datasets: [{ data: [], backgroundColor: 'rgba(255,107,53,0.2)', borderColor: '#ff6b35', borderWidth: 1, borderRadius: 4 }] },
        options: Object.assign({}, bo, { indexAxis: 'y' })
      });
      sysSevChart = new Chart(document.getElementById('sysSevChart'), {
        type: 'doughnut',
        data: { labels: [], datasets: [{ data: [], backgroundColor: ['#ff2d55', '#ff6b35', '#ffd60a', '#00e5ff', '#39ff14', '#5c7d92'], borderWidth: 0 }] },
        options: { responsive: true, animation: false, plugins: { legend: { position: 'right', labels: { color: ct.tick, font: { size: 10 } } } } }
      });
      pingHistChart = new Chart(document.getElementById('pingHistChart'), {
        type: 'line',
        data: { labels: [], datasets: [{ data: [], borderColor: '#00e5ff', backgroundColor: 'rgba(0,229,255,0.06)', borderWidth: 2, pointRadius: 3, tension: 0.3, fill: true }] },
        options: {
          responsive: true, animation: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { grid: { color: ct.grid }, ticks: { color: ct.tick, maxTicksLimit: 10 } },
            y: { grid: { color: ct.grid }, ticks: { color: ct.tick }, beginAtZero: true }
          }
        }
      });
    }

    // â”€â”€ BADGES â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    function oltBadge(id) {
      var colors = ['bc', 'bo', 'bg', 'by'];
      var i = id ? (id.charCodeAt(id.length - 1) % 4) : 0;
      return '<span class="b ' + colors[i] + '">' + (id || 'UNKNOWN') + '</span>';
    }
    function sevBadge(s) {
      var map = { emergency: 'br', alert: 'br', critical: 'br', error: 'br', major: 'br', warning: 'by', notice: 'bc', info: 'bc' };
      return '<span class="b ' + (map[(s || '').toLowerCase()] || 'bx') + '">' + (s || 'â€”') + '</span>';
    }
    function tagBadge(t) {
      if (!t) return '<span class="b bx">GENERAL</span>';
      if (t === 'UPLINK_DOWN' || t === 'LOGIN_FAILED') return '<span class="b br">' + t + '</span>';
      if (t === 'UPLINK_UP' || t === 'USER_LOGIN') return '<span class="b bg">' + t + '</span>';
      if (t === 'USER_LOGOUT') return '<span class="b by">' + t + '</span>';
      if (t === 'OLT_REBOOT' || t === 'OLT_COLD_START' || t === 'OLT_WARM_START') return '<span class="b bo">' + t + '</span>';
      if (t === 'CONFIG_CHANGE' || t === 'CONFIG_SAVE') return '<span class="b bc">' + t + '</span>';
      if (t.indexOf('DOWN') >= 0 || t.indexOf('FAIL') >= 0 || t.indexOf('OFFLINE') >= 0 || t.indexOf('ERR') >= 0 || t.indexOf('GASP') >= 0) return '<span class="b br">' + t + '</span>';
      if (t.indexOf('UP') >= 0 || t.indexOf('ONLINE') >= 0) return '<span class="b bg">' + t + '</span>';
      if (t.indexOf('AUTH') >= 0 || t.indexOf('CONFIG') >= 0) return '<span class="b bo">' + t + '</span>';
      return '<span class="b bc">' + t + '</span>';
    }

    // â”€â”€ AUTH â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    function loadUserInfo() {
      apiFetch('/api/auth/me').then(function (d) {
        currentUsername = d.username;
        currentRole = d.role;
        globalVisibleTabs = Array.isArray(d.global_visible_tabs) ? d.global_visible_tabs.slice() : getDefaultTabsForRole('viewer');
        if (d.role === 'admin') {
          currentVisibleTabs = getDefaultTabsForRole('admin');
        } else {
          currentVisibleTabs = Array.isArray(d.effective_visible_tabs) ? d.effective_visible_tabs.slice() : getDefaultTabsForRole(d.role);
        }
        document.getElementById('currentUser').textContent = d.username;
        document.getElementById('currentRole').textContent = roleLabel(d.role);
        applyVisibleTabs(currentVisibleTabs);
        setSettingsTabSelections(globalVisibleTabs);
        syncUserTabAvailability('nuVisibleTabs', document.getElementById('nuRole').value);
        syncUserTabAvailability('euVisibleTabs', document.getElementById('euRole').value);
        if (d.role === 'admin') {
          var usersBtn = document.getElementById('usersBtn');
          var usersTabBtn = document.getElementById('tab-btn-users');
          var addUserPanel = document.getElementById('addUserPanel');
          var userListPanel = document.getElementById('userListPanel');
          var editUserPanel = document.getElementById('editUserPanel');
          if (usersBtn) usersBtn.style.display = 'block';
          if (usersTabBtn) usersTabBtn.style.display = 'block';
          if (addUserPanel) addUserPanel.style.display = 'block';
          if (userListPanel) userListPanel.style.display = 'block';
          if (editUserPanel) editUserPanel.style.display = 'block';
        }
      }).catch(function () { });
    }

    function doLogout() {
      apiPost('/api/auth/logout', {}).then(function () {
        window.location.href = '/login';
      }).catch(function () {
        window.location.href = '/login';
      });
    }

    function changePassword() {
      var oldP = document.getElementById('cpOld').value;
      var newP = document.getElementById('cpNew').value;
      var conP = document.getElementById('cpConfirm').value;
      if (!oldP || !newP || !conP) { showMsg('cpMsg', 'All fields required', false); return; }
      if (newP !== conP) { showMsg('cpMsg', 'New passwords do not match', false); return; }
      if (newP.length < 6) { showMsg('cpMsg', 'Min 6 characters', false); return; }
      apiPost('/api/auth/change_password', { old_password: oldP, new_password: newP })
        .then(function (d) {
          if (d.success) {
            showMsg('cpMsg', 'Password changed!', true);
            document.getElementById('cpOld').value = '';
            document.getElementById('cpNew').value = '';
            document.getElementById('cpConfirm').value = '';
          } else { showMsg('cpMsg', d.error || 'Failed', false); }
        });
    }

    // â”€â”€ AVAILABLE TARGETS (OLT + Ping) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    var _availableTargets = { olts: [], ping: [] };

    function loadAvailableTargets() {
      apiFetch('/api/auth/available_targets').then(function(data) {
        // API returns {olts:[{name,host}], ping_targets:[{name,ip}]}
        // Normalize to flat string arrays for the checkbox renderer
        var oltNames  = (data.olts || []).map(function(o) { return o.name || o.host || o; });
        var pingNames = (data.ping_targets || data.ping || []).map(function(p) { return p.name || p.ip || p; });
        _availableTargets = { olts: oltNames, ping: pingNames };
        _renderTargetChecks('nuOltTargets',  oltNames, [], 'olt');
        _renderTargetChecks('nuPingTargets', pingNames, [], 'ping');
      }).catch(function() {});
    }

    function _renderTargetChecks(containerId, items, selected, kind) {
      var el = document.getElementById(containerId);
      if (!el) return;
      if (!items || !items.length) {
        el.innerHTML = '<span style="font-size:11px;color:var(--muted)">No ' + (kind === 'olt' ? 'OLTs' : 'Ping targets') + ' configured yet.</span>';
        return;
      }
      var allSelected = selected.indexOf('*') !== -1;
      var html = '<label style="display:flex;align-items:center;gap:6px;font-size:11px;cursor:pointer;padding:3px 0;color:var(--accent);border-bottom:1px solid var(--border);margin-bottom:4px">';
      html += '<input type="checkbox" data-kind="' + kind + '" data-val="*" ' + (allSelected ? 'checked' : '') + ' onchange="_onAllTargetCheck(this,\'' + containerId + '\')"> <b>All (wildcard)</b></label>';
      items.forEach(function(item) {
        var checked = allSelected || selected.indexOf(item) !== -1;
        html += '<label style="display:flex;align-items:center;gap:6px;font-size:11px;cursor:pointer;padding:2px 0">';
        html += '<input type="checkbox" data-kind="' + kind + '" data-val="' + item + '" ' + (checked ? 'checked' : '') + '> ' + item + '</label>';
      });
      el.innerHTML = html;
    }

    function _onAllTargetCheck(cb, containerId) {
      var el = document.getElementById(containerId);
      if (!el) return;
      var checks = el.querySelectorAll('input[type=checkbox]:not([data-val="*"])');
      checks.forEach(function(c) { c.checked = cb.checked; });
    }

    function _getCheckedTargets(containerId) {
      var el = document.getElementById(containerId);
      if (!el) return [];
      var allCb = el.querySelector('input[data-val="*"]');
      if (allCb && allCb.checked) return ['*'];
      var vals = [];
      el.querySelectorAll('input[type=checkbox]:not([data-val="*"])').forEach(function(c) {
        if (c.checked) vals.push(c.dataset.val);
      });
      return vals;
    }

    function addUser() {
      var username = document.getElementById('nuUsername').value.trim();
      var password = document.getElementById('nuPassword').value;
      var email    = (document.getElementById('nuEmail').value || '').trim();
      var role     = document.getElementById('nuRole').value;
      var visibleTabs       = getUserTabSelections('nuVisibleTabs', role);
      var assignedOlts      = _getCheckedTargets('nuOltTargets');
      var assignedPing      = _getCheckedTargets('nuPingTargets');
      if (!username || !password) { showMsg('nuMsg', 'Username and password are required.', false); return; }
      if (password.length < 6)    { showMsg('nuMsg', 'Password must be at least 6 characters.', false); return; }
      apiPost('/api/auth/users/add', {
        username: username,
        password: password,
        email: email,
        role: role,
        visible_tabs: visibleTabs,
        assigned_olts: assignedOlts,
        assigned_ping_targets: assignedPing
      }).then(function(d) {
        if (d.success) {
          showMsg('nuMsg', '\u2714 User created: ' + username, true);
          document.getElementById('nuUsername').value = '';
          document.getElementById('nuPassword').value = '';
          document.getElementById('nuEmail').value = '';
          document.getElementById('nuRole').value = 'viewer';
          setUserTabSelections('nuVisibleTabs', getDefaultTabsForRole('viewer'));
          syncUserTabAvailability('nuVisibleTabs', 'viewer');
          _renderTargetChecks('nuOltTargets',  _availableTargets.olts, [], 'olt');
          _renderTargetChecks('nuPingTargets', _availableTargets.ping, [], 'ping');
          loadUsers();
        } else { showMsg('nuMsg', d.error || 'Failed', false); }
      }).catch(function(e) {
        showMsg('nuMsg', e.message || 'Server error â€” check console.', false);
      });
    }

    function startEditUser(encodedUser) {
      var user = encodedUser;
      if (typeof encodedUser === 'string') {
        try { user = JSON.parse(decodeURIComponent(encodedUser)); } catch (e) { user = null; }
      }
      if (!user) return;
      editingUsername = user.username || '';
      document.getElementById('euUsername').value = editingUsername;
      document.getElementById('euRole').value = user.role || 'viewer';
      document.getElementById('euEmail').value = user.email || '';
      document.getElementById('euPassword').value = '';
      setUserTabSelections('euVisibleTabs', user.visible_tabs || getDefaultTabsForRole(user.role || 'viewer'));
      syncUserTabAvailability('euVisibleTabs', user.role || 'viewer');
      // Populate site assignment checkboxes with saved selections
      var savedOlts = Array.isArray(user.assigned_olts) ? user.assigned_olts : [];
      var savedPing = Array.isArray(user.assigned_ping_targets) ? user.assigned_ping_targets : [];
      _renderTargetChecks('euOltTargets',  _availableTargets.olts, savedOlts, 'olt');
      _renderTargetChecks('euPingTargets', _availableTargets.ping, savedPing, 'ping');
      showMsg('euMsg', '\u270F\uFE0F Editing ' + editingUsername, true, true);
      // Scroll form into view
      var panel = document.getElementById('editUserPanel');
      if (panel) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function saveUserEdit() {
      if (currentRole !== 'admin') return;
      var username    = document.getElementById('euUsername').value.trim();
      var role        = document.getElementById('euRole').value;
      var email       = (document.getElementById('euEmail').value || '').trim();
      var newPassword = (document.getElementById('euPassword').value || '').trim();
      var visibleTabs       = getUserTabSelections('euVisibleTabs', role);
      var assignedOlts      = _getCheckedTargets('euOltTargets');
      var assignedPing      = _getCheckedTargets('euPingTargets');
      if (!username) { showMsg('euMsg', 'Select a user to edit first.', false, true); return; }
      if (newPassword && newPassword.length < 6) { showMsg('euMsg', 'New password must be at least 6 characters.', false, true); return; }
      var payload = { username: username, role: role, email: email, visible_tabs: visibleTabs,
                      assigned_olts: assignedOlts, assigned_ping_targets: assignedPing };
      if (newPassword) payload.new_password = newPassword;
      apiPost('/api/auth/users/edit', payload).then(function(d) {
        if (d.success) {
          showMsg('euMsg', '\u2714 User updated: ' + username, true, true);
          if (username === currentUsername) {
            currentRole = d.role;
            currentVisibleTabs = (d.visible_tabs || currentVisibleTabs).filter(function(tab) {
              return globalVisibleTabs.indexOf(tab) !== -1 || tab === 'users' || tab === 'logs';
            });
            document.getElementById('currentRole').textContent = roleLabel(currentRole);
            applyVisibleTabs(currentVisibleTabs);
          }
          loadUsers();
        } else {
          showMsg('euMsg', d.error || 'Failed', false, true);
        }
      }).catch(function(e) {
        if (e.message === '401') return;
        showMsg('euMsg', e.message || 'Server error', false, true);
      });
    }

    function deleteUser(username) {
      if (!confirm('Delete user: ' + username + '?')) return;
      apiPost('/api/auth/users/delete', { username: username }).then(function () { loadUsers(); });
    }

    function loadUsers() {
      apiFetch('/api/auth/users').then(function (users) {
        document.getElementById('userCount').textContent = users.length + ' users';
        if (!users.length) {
          document.getElementById('userTable').innerHTML = '<tr><td colspan="9"><div class="empty">No users.</div></td></tr>';
          return;
        }
        var html = '';
        users.forEach(function (u) {
          var isMe = u.username === currentUsername;
          var roleCls = u.role === 'admin' ? 'bo' : 'bx';
          var tabs = Array.isArray(u.visible_tabs) ? u.visible_tabs : [];
          var tabsLabel = tabs.length ? tabs.join(', ') : 'default';
          // Build assigned sites badges
          var oltList  = Array.isArray(u.assigned_olts)          ? u.assigned_olts          : [];
          var pingList = Array.isArray(u.assigned_ping_targets)  ? u.assigned_ping_targets  : [];
          var sitesBadges = '';
          if (oltList.indexOf('*') !== -1) {
            sitesBadges += '<span class="b bc" style="font-size:9px;margin:1px">ALL OLTs</span>';
          } else {
            oltList.forEach(function(o) { sitesBadges += '<span class="b bc" style="font-size:9px;margin:1px">' + o + '</span>'; });
          }
          if (pingList.indexOf('*') !== -1) {
            sitesBadges += '<span class="b bx" style="font-size:9px;margin:1px">ALL PING</span>';
          } else {
            pingList.forEach(function(p) { sitesBadges += '<span class="b bx" style="font-size:9px;margin:1px">' + p + '</span>'; });
          }
          if (!sitesBadges) sitesBadges = '<span style="font-size:11px;color:var(--muted)">None</span>';
          var emailDisp = u.email ? ('<span style="font-size:11px">' + u.email + '</span>') : '<span style="color:var(--muted);font-size:11px">â€”</span>';
          var payload = encodeURIComponent(JSON.stringify({
            username: u.username, role: u.role, email: u.email || '',
            visible_tabs: tabs,
            assigned_olts: oltList,
            assigned_ping_targets: pingList
          }));
          var created   = u.created_at  ? new Date(u.created_at).toLocaleDateString()  : 'â€”';
          var lastLogin = u.last_login   ? new Date(u.last_login).toLocaleString()      : 'Never';
          var editBtn = '<button class="dbtn" data-user="' + payload + '" onclick="startEditUser(this.dataset.user)">Edit</button>';
          var meTag = isMe ? ' <span class="b bc" style="font-size:9px">YOU</span>' : '';
          var delBtn = isMe ? 'â€”' : ('<button class="dbtn" data-uname="' + u.username + '" onclick="deleteUser(this.dataset.uname)">Delete</button>');
          html += '<tr>';
          html += '<td class="mu">' + u.id + '</td>';
          html += '<td style="color:var(--accent3)">' + u.username + meTag + '</td>';
          html += '<td><span class="b ' + roleCls + '">' + roleLabel(u.role) + '</span></td>';
          html += '<td>' + emailDisp + '</td>';
          html += '<td style="white-space:normal">' + sitesBadges + '</td>';
          html += '<td class="mu">' + tabsLabel + '</td>';
          html += '<td class="mu">' + created + '</td>';
          html += '<td class="mu">' + lastLogin + '</td>';
          html += '<td>' + (isMe ? editBtn : (editBtn + ' ' + delBtn)) + '</td>';
          html += '</tr>';
        });
        document.getElementById('userTable').innerHTML = html;
      }).catch(function () { });
    }

    // â”€â”€ SYSLOG FILTER â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    function filterSyslog() {
      currentSysOlt = document.getElementById('sysFilter').value;
      fetchAll();
    }

    // â”€â”€ RENAME FUNCTIONS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    function renameDevice(mac) {
      var mid = mac.replace(/:/g, '_');
      var inp = document.getElementById('inp_' + mid);
      if (!inp || !inp.value.trim()) return;
      apiPost('/api/devices/rename', { olt_mac: mac, name: inp.value.trim() })
        .then(function () { fetchAll(); });
    }

    function renameSyslogDevice(hostname) {
      var mid = hostname.replace(/[^a-zA-Z0-9]/g, '_');
      var inp = document.getElementById('sinp_' + mid);
      if (!inp || !inp.value.trim()) return;
      apiPost('/api/syslog/devices/rename', { olt_hostname: hostname, name: inp.value.trim() })
        .then(function () { fetchAll(); });
    }

    function setSyslogDeviceAuth(hostname, status) {
      if (currentRole !== 'admin') {
        alert('Admin only');
        return;
      }
      var actionStr = status === 1 ? 'accept' : 'deny';
      if (!confirm('Are you sure you want to ' + actionStr + ' syslog device ' + hostname + '?')) return;
      apiPost('/api/syslog/devices/authorize', { olt_hostname: hostname, authorized: status })
        .then(function (r) {
          if (r.success) {
            fetchAll();
          } else {
            alert('Error: ' + (r.error || 'Failed'));
          }
        }).catch(function (e) {
          alert('Request failed: ' + e.message);
        });
    }

    function deleteSyslogDevice(hostname) {
      if (currentRole !== 'admin') {
        alert('Admin only');
        return;
      }
      if (!confirm('Are you sure you want to delete syslog device ' + hostname + ' and ALL of its stored syslog messages? This cannot be undone.')) return;
      apiPost('/api/syslog/devices/delete', { olt_hostname: hostname })
        .then(function (r) {
          if (r.success) {
            var sel = document.getElementById('sysFilter');
            if (sel && sel.value === hostname) {
              sel.value = '';
              currentSysOlt = '';
            }
            fetchAll();
          } else {
            alert('Error: ' + (r.error || 'Failed'));
          }
        }).catch(function (e) {
          alert('Request failed: ' + e.message);
        });
    }

    // â”€â”€ PING â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    function addPingTarget() {
      if (currentRole !== 'admin') { alert('Admin only'); return; }
      var ip = document.getElementById('pingIpInput').value.trim();
      var name = document.getElementById('pingNameInput').value.trim();
      var website = document.getElementById('pingWebsiteInput').value.trim();
      if (!ip) { alert('Please enter an IP address'); return; }
      var btn = document.getElementById('pingAddBtn');
      btn.textContent = 'Adding...'; btn.disabled = true;
      apiPost('/api/ping/add', { ip: ip, name: name, website: website })
        .then(function (d) {
          if (d.success) {
            document.getElementById('pingIpInput').value = '';
            document.getElementById('pingNameInput').value = '';
            document.getElementById('pingWebsiteInput').value = '';
            fetchPing();
          } else { alert('Error: ' + (d.error || 'unknown')); }
          btn.textContent = '+ ADD'; btn.disabled = false;
        }).catch(function (e) {
          btn.textContent = '+ ADD'; btn.disabled = false;
        });
    }

    function removePingTarget(ip) {
      if (currentRole !== 'admin') { alert('Admin only'); return; }
      if (!confirm('Remove ' + ip + '?')) return;
      apiPost('/api/ping/remove', { ip: ip }).then(function () { fetchPing(); });
    }

    function renamePingTarget(ip) {
      if (currentRole !== 'admin') { alert('Admin only'); return; }
      var mid = ip.replace(/\./g, '_');
      var inp = document.getElementById('pinp_' + mid);
      if (!inp || !inp.value.trim()) return;
      apiPost('/api/ping/rename', { ip: ip, name: inp.value.trim() })
        .then(function () { fetchPing(); });
    }

    function showPingHistory(ip, name) {
      document.getElementById('pingHistLabel').textContent = name + ' (' + ip + ')';
      apiFetch('/api/ping/history/' + ip).then(function (rows) {
        rows.reverse();
        pingHistChart.data.labels = rows.map(function (r) { return new Date(r.timestamp).toLocaleTimeString(); });
        pingHistChart.data.datasets[0].data = rows.map(function (r) { return r.latency_ms; });
        pingHistChart.update('none');
      }).catch(function () { });
    }

    function latColor(ms) {
      if (!ms) return 'var(--muted)';
      if (ms < 50) return 'var(--accent3)';
      if (ms < 100) return 'var(--warn)';
      return 'var(--danger)';
    }

    function latStr(ms) {
      if (!ms) return 'â€”';
      return parseFloat(ms).toFixed(1) + ' ms';
    }

    function normalizeLaunchUrl(url) {
      var value = (url || '').trim();
      if (!value) return '';
      if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) value = 'http://' + value;
      return value;
    }

    function launchWebsite(url, evt) {
      if (evt) evt.stopPropagation();
      var target = normalizeLaunchUrl(url);
      if (!target) return;
      window.open(target, '_blank', 'noopener');
    }

    function buildPingRow(t, pingHistory) {
      var st = t.status || 'unknown';
      var lat = t.latency_ms;
      var avg = t.avg_latency;
      var loss = parseFloat(t.loss_pct) || 0;
      var mid = t.ip.replace(/\./g, '_');
      var nm = t.name || t.ip;
      var cur = (t.name && t.name !== t.ip) ? t.name : '';
      var lossClr = loss > 20 ? 'var(--danger)' : loss > 5 ? 'var(--warn)' : 'var(--accent3)';
      var pingCount = pingHistory ? pingHistory.length : (t.ping_count || 0);

      // Max latency for bar scaling (use avg*3 or 200ms minimum)
      var maxLat = Math.max(200, (avg || lat || 50) * 3);

      var tr = document.createElement('tr');
      tr.id = 'prow_' + mid;
      tr.onclick = function () {
        document.querySelectorAll('.ping-table tr').forEach(function (r) {
          r.classList.remove('selected');
        });
        tr.classList.add('selected');
        showPingHistory(t.ip, nm);
      };

      // Status dot + label
      var tdSt = document.createElement('td');
      tdSt.style.cssText = 'text-align:center;white-space:nowrap';
      var stColor = st === 'online' ? 'var(--accent3)' : st === 'offline' ? 'var(--danger)' : 'var(--warn)';
      var stText = st === 'online' ? 'Online' : st === 'offline' ? 'Offline' : 'Unknown';

      var dot = document.createElement('span');
      dot.className = 'ping-dot ' + st;
      dot.style.marginRight = '5px';
      dot.style.verticalAlign = 'middle';

      var stLbl = document.createElement('span');
      stLbl.style.cssText = 'font-size:11px;font-weight:700;color:' + stColor + ';vertical-align:middle;letter-spacing:0.5px';
      stLbl.textContent = stText;

      tdSt.appendChild(dot);
      tdSt.appendChild(stLbl);
      tr.appendChild(tdSt);

      // Count
      var tdCnt = document.createElement('td');
      tdCnt.style.cssText = 'text-align:center;color:var(--muted);font-size:11px';
      tdCnt.textContent = pingCount || 'â€”';
      tr.appendChild(tdCnt);

      // IP
      var tdIp = document.createElement('td');
      tdIp.style.cssText = 'font-family:monospace;font-size:12px;color:var(--accent);letter-spacing:0.5px';
      tdIp.textContent = t.ip;
      tr.appendChild(tdIp);

      // Name
      var tdNm = document.createElement('td');
      tdNm.style.cssText = 'font-weight:600;color:var(--text)';
      var nameSpan = document.createElement('span');
      nameSpan.textContent = nm;
      tdNm.appendChild(nameSpan);
      if (lat && lat > 100) {
        var w = document.createElement('span');
        w.style.cssText = 'color:var(--warn);margin-left:6px;font-size:11px';
        w.title = 'High Latency';
        w.textContent = '!';
        tdNm.appendChild(w);
      }
      if (loss > 20) {
        var w2 = document.createElement('span');
        w2.style.cssText = 'color:var(--danger);margin-left:4px;font-size:11px';
        w2.title = 'Packet Loss';
        w2.textContent = '!';
        tdNm.appendChild(w2);
      }
      tr.appendChild(tdNm);

      // Avg
      var tdAvg = document.createElement('td');
      tdAvg.style.cssText = 'text-align:right;font-family:monospace;font-size:12px;color:' + latColor(avg);
      tdAvg.textContent = avg ? avg.toFixed(1) : 'â€”';
      tr.appendChild(tdAvg);

      // Min (use avg as proxy if not stored)
      var tdMin = document.createElement('td');
      tdMin.style.cssText = 'text-align:right;font-family:monospace;font-size:12px;color:var(--accent3)';
      tdMin.textContent = t.min_latency ? t.min_latency.toFixed(1) : (avg ? (avg * 0.85).toFixed(1) : 'â€”');
      tr.appendChild(tdMin);

      // Current
      var tdCur = document.createElement('td');
      tdCur.style.cssText = 'text-align:right;font-family:monospace;font-size:12px;font-weight:700;color:' + latColor(lat);
      tdCur.textContent = lat ? lat.toFixed(1) : (st === 'offline' ? '*' : 'â€”');
      tr.appendChild(tdCur);

      // Loss %
      var tdLoss = document.createElement('td');
      tdLoss.style.cssText = 'text-align:right;font-family:monospace;font-size:12px;color:' + lossClr;
      tdLoss.textContent = loss > 0 ? loss.toFixed(0) + '%' : 'â€”';
      tr.appendChild(tdLoss);

      // Latency bar
      var tdBar = document.createElement('td');
      var barWrap = document.createElement('div');
      barWrap.className = 'ping-bar-wrap';
      barWrap.style.width = '140px';
      var barFill = document.createElement('div');
      barFill.className = 'ping-bar-fill';
      var pct = lat ? Math.min(100, (lat / maxLat) * 100) : 0;
      barFill.style.width = pct + '%';
      barFill.style.background = latColor(lat);
      if (st === 'offline') {
        barFill.style.width = '100%';
        barFill.style.background = 'var(--danger)';
        barFill.style.opacity = '0.3';
      }
      barWrap.appendChild(barFill);
      tdBar.appendChild(barWrap);
      if (lat) {
        var latLabel = document.createElement('span');
        latLabel.style.cssText = 'font-size:10px;color:var(--muted);margin-left:6px;font-family:monospace';
        latLabel.textContent = lat.toFixed(0) + 'ms';
        tdBar.appendChild(latLabel);
      }
      tr.appendChild(tdBar);

      // Last Seen
      var tdSeen = document.createElement('td');
      var seenTs = t.last_seen ? new Date(t.last_seen) : null;
      if (seenTs) {
        var diffSec = Math.floor((Date.now() - seenTs) / 1000);
        var agoStr = '';
        if (diffSec < 60) agoStr = diffSec + 's ago';
        else if (diffSec < 3600) agoStr = Math.floor(diffSec / 60) + 'm ago';
        else if (diffSec < 86400) agoStr = Math.floor(diffSec / 3600) + 'h ' + Math.floor((diffSec % 3600) / 60) + 'm ago';
        else agoStr = Math.floor(diffSec / 86400) + 'd ago';

        var seenColor = st === 'offline'
          ? (diffSec > 300 ? 'var(--danger)' : 'var(--warn)')
          : 'var(--text)';

        var seenDiv = document.createElement('div');
        seenDiv.style.cssText = 'font-size:11px;color:' + seenColor + ';font-family:monospace';
        seenDiv.textContent = seenTs.toLocaleTimeString();

        var agoDiv = document.createElement('div');
        agoDiv.style.cssText = 'font-size:10px;color:' + (st === 'offline' ? seenColor : 'var(--muted)') + ';margin-top:2px';
        agoDiv.textContent = agoStr;

        tdSeen.appendChild(seenDiv);
        tdSeen.appendChild(agoDiv);
      } else {
        tdSeen.style.cssText = 'color:var(--muted);font-size:11px';
        tdSeen.textContent = 'Never';
      }
      tr.appendChild(tdSeen);

      var tdWebsite = document.createElement('td');
      tdWebsite.style.textAlign = 'center';
      tdWebsite.onclick = function (e) { e.stopPropagation(); };
      if (t.website) {
        var launchBtn = document.createElement('button');
        launchBtn.className = 'rb';
        launchBtn.style.cssText = 'font-size:9px;padding:3px 8px';
        launchBtn.textContent = 'Launch';
        launchBtn.onclick = function (e) { launchWebsite(t.website, e); };
        tdWebsite.appendChild(launchBtn);
      } else {
        tdWebsite.innerHTML = '<span class="mu" style="font-size:10px">-</span>';
      }
      tr.appendChild(tdWebsite);

      // Actions: rename inline + delete
      var tdAct = document.createElement('td');
      tdAct.style.textAlign = 'center';
      tdAct.onclick = function (e) { e.stopPropagation(); };

      if (currentRole !== 'admin') {
        tdAct.innerHTML = '<span class="mu" style="font-size:10px">View only</span>';
        tr.appendChild(tdAct);
        return tr;
      }

      var renBtn = document.createElement('button');
      renBtn.className = 'rb';
      renBtn.style.cssText = 'font-size:9px;padding:3px 7px;margin-right:4px';
      renBtn.textContent = 'Edit';
      renBtn.onclick = function (e) {
        e.stopPropagation();
        var newName = prompt('Rename "' + nm + '":', nm);
        if (newName === null) return;
        var newWebsite = prompt('Website URL for ' + t.ip + ':', t.website || '');
        if (newWebsite === null) return;
        apiPost('/api/ping/rename', { ip: t.ip, name: (newName || '').trim(), website: (newWebsite || '').trim() })
          .then(function () { fetchPing(); });
      };

      var delBtn = document.createElement('button');
      delBtn.className = 'dbtn';
      delBtn.style.cssText = 'font-size:9px;padding:3px 6px';
      delBtn.textContent = 'X';
      delBtn.onclick = function (e) {
        e.stopPropagation();
        removePingTarget(t.ip);
      };

      tdAct.appendChild(renBtn);
      tdAct.appendChild(delBtn);
      tr.appendChild(tdAct);

      return tr;
    }

    // Keep old name as alias for any remaining callers
    function buildPingCard(t) { return buildPingRow(t, null); }


    // â”€â”€ FETCH PING â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    function fetchPing() {
      apiFetch('/api/ping/targets').then(function (targets) {
        var pingAddBtn = document.getElementById('pingAddBtn');
        var pingIpInput = document.getElementById('pingIpInput');
        var pingNameInput = document.getElementById('pingNameInput');
        var pingWebsiteInput = document.getElementById('pingWebsiteInput');
        var canManagePing = currentRole === 'admin';
        if (pingAddBtn) {
          pingAddBtn.disabled = !canManagePing;
          pingAddBtn.textContent = canManagePing ? '+ ADD' : 'VIEW ONLY';
        }
        if (pingIpInput) pingIpInput.disabled = !canManagePing;
        if (pingNameInput) pingNameInput.disabled = !canManagePing;
        if (pingWebsiteInput) pingWebsiteInput.disabled = !canManagePing;
        document.getElementById('pingOnline').textContent = targets.filter(function (t) { return t.status === 'online'; }).length;
        document.getElementById('pingOffline').textContent = targets.filter(function (t) { return t.status === 'offline'; }).length;
        document.getElementById('pingHighLat').textContent = targets.filter(function (t) { return t.latency_ms && t.latency_ms > 100; }).length;
        document.getElementById('pingTotal').textContent = targets.length;
        document.getElementById('pingCount').textContent = targets.length + ' targets';

        var tbody = document.getElementById('pingTableBody');
        if (!tbody) return;
        tbody.innerHTML = '';

        if (!targets.length) {
          var tr = document.createElement('tr');
          var td = document.createElement('td');
          td.colSpan = 12;
          td.innerHTML = '<div class="empty">No targets added yet. Add an IP above.</div>';
          tr.appendChild(td);
          tbody.appendChild(tr);
          return;
        }

        // Sort: offline first, then by name
        targets.sort(function (a, b) {
          if (a.status === 'offline' && b.status !== 'offline') return -1;
          if (b.status === 'offline' && a.status !== 'offline') return 1;
          return (a.name || a.ip).localeCompare(b.name || b.ip);
        });

        targets.forEach(function (t) {
          tbody.appendChild(buildPingRow(t, null));
        });
      });
    }


    function fetchAll() {
      var sysQ = currentSysOlt ? ('?olt_hostname=' + encodeURIComponent(currentSysOlt)) : '';

      Promise.all([
        apiFetch('/api/traps').catch(function() { return []; }),
        apiFetch('/api/traps/summary').catch(function() { return []; }),
        apiFetch('/api/devices').catch(function() { return []; }),
        apiFetch('/api/syslog' + sysQ).catch(function() { return []; }),
        apiFetch('/api/syslog/events' + sysQ).catch(function() { return []; }),
        apiFetch('/api/syslog/summary').catch(function() { return []; }),
        apiFetch('/api/syslog/severity').catch(function() { return []; }),
        apiFetch('/api/syslog/devices').catch(function() { return []; })
      ]).then(function (data) {
        var traps = data[0], summary = data[1], devices = data[2], syslog = data[3];
        var sysEvts = data[4], sysSumm = data[5], sysSev = data[6], sysDevices = data[7];

        var eb = document.getElementById('errBanner');
        if (eb) eb.classList.remove('show');

        var nameMap = {};
        devices.forEach(function (d) { nameMap[d.olt_mac] = (d.name && d.name !== d.olt_id) ? d.name : d.olt_id; });

        // SNMP stats
        var total = summary.reduce(function (a, s) { return a + s.count; }, 0);
        document.getElementById('stTotal').textContent = total.toLocaleString();
        document.getElementById('stOnline').textContent = devices.filter(function (d) { return d.status === 'online'; }).length;
        document.getElementById('stOffline').textContent = devices.filter(function (d) { return d.status === 'offline'; }).length;
        if (traps.length) {
          document.getElementById('stLast').textContent = new Date(traps[0].timestamp).toLocaleTimeString();
          document.getElementById('stLastOlt').textContent = nameMap[traps[0].olt_mac] || traps[0].olt_id || traps[0].source_ip;
        }

        barChart.data.labels = summary.map(function (s) { return nameMap[s.olt_mac] || s.olt_id || s.olt_mac; });
        barChart.data.datasets[0].data = summary.map(function (s) { return s.count; });
        barChart.update('none');
        document.getElementById('oltCount').textContent = summary.length + ' OLTs';

        var grouped = {};
        traps.slice(0, 60).reverse().forEach(function (t) {
          var min = t.timestamp.substring(11, 16);
          grouped[min] = (grouped[min] || 0) + 1;
        });
        lineChart.data.labels = Object.keys(grouped);
        lineChart.data.datasets[0].data = Object.values(grouped);
        lineChart.update('none');
        document.getElementById('lineLabel').textContent = traps.length + ' records';
        document.getElementById('trapCount').textContent = traps.length + ' records';

        var tbody = document.getElementById('trapTable');
        if (!traps.length) {
          tbody.innerHTML = '<tr><td colspan="6"><div class="empty">No traps yet.</div></td></tr>';
        } else {
          var r = '';
          traps.slice(0, 50).forEach(function (t) {
            r += '<tr><td class="mu">' + t.id + '</td><td class="mu">' + new Date(t.timestamp).toLocaleTimeString() + '</td><td>' + oltBadge(nameMap[t.olt_mac] || t.olt_id) + '</td><td><span class="b bc">' + t.source_ip + '</span></td><td style="color:var(--accent3)">' + (t.oid_name || t.oid) + '</td><td class="mu">' + (t.value || '').substring(0, 40) + '</td></tr>';
          });
          tbody.innerHTML = r;
        }

        // Syslog devices
        var sel = document.getElementById('sysFilter');
        var prev = sel.value;
        while (sel.options.length > 1) sel.remove(1);
        sysDevices.forEach(function (d) {
          if (d.authorized !== 1) return; // Only show accepted devices in filter dropdown
          var nm = (d.name && d.name !== d.olt_hostname) ? d.name : d.olt_hostname;
          var opt = document.createElement('option');
          opt.value = d.olt_hostname; opt.textContent = nm;
          if (d.olt_hostname === prev) opt.selected = true;
          sel.appendChild(opt);
        });
        document.getElementById('sysDevCount').textContent = sysDevices.length + ' devices';

        var sdg = document.getElementById('sysDevGrid');
        if (!sysDevices.length) { sdg.innerHTML = '<div class="empty">No syslog devices yet.</div>'; }
        else {
          var dh = '';
          sysDevices.forEach(function (d) {
            var nm = (d.name && d.name !== d.olt_hostname) ? d.name : d.olt_hostname;
            var seen = d.last_seen ? new Date(d.last_seen).toLocaleString() : 'Never';
            var mid = (d.olt_hostname || '').replace(/[^a-zA-Z0-9]/g, '_');
            var st = d.status || 'unknown';
            var stClass = st;
            var stDisplay = st;
            if (st === 'offline') stDisplay = 'Not receiving offline';
            if (st === 'receiving') stDisplay = 'Receiving';
            if (st === 'standby') stDisplay = 'Standby';
            var cur = (d.name && d.name !== d.olt_hostname) ? d.name : '';

            // Authorization status badge
            var auth = d.authorized;
            var authText = 'Pending';
            var authClass = 'by'; // yellow badge
            if (auth === 1) {
              authText = 'Accepted';
              authClass = 'bg'; // green badge
            } else if (auth === 2) {
              authText = 'Denied';
              authClass = 'br'; // red badge
            }

            dh += '<div class="oc ' + stClass + '">';
            dh += '<div class="otop"><div><div class="oname">' + nm + '</div><div style="margin-top:3px">' + oltBadge(d.olt_hostname) + '<span class="b ' + authClass + '" style="margin-left:6px">' + authText + '</span></div></div>';
            dh += '<div class="pill ' + stClass + '">' + stDisplay + '</div></div>';
            dh += '<div class="om">Hostname: <span>' + (d.olt_hostname || 'â€”') + '</span></div>';
            dh += '<div class="om">IP: <span>' + (d.source_ip || 'â€”') + '</span></div>';
            dh += '<div class="om">Last seen: <span>' + seen + '</span></div>';
            dh += '<div class="rrow"><input class="ri" id="sinp_' + mid + '" placeholder="Set name..." value="' + cur + '"/>';
            dh += '<button class="rb" data-host="' + d.olt_hostname + '" onclick="renameSyslogDevice(this.dataset.host)">Save</button></div>';

            // Authorization actions + delete
            dh += '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px">';
            dh += '<div style="display:flex;gap:5px">';
            if (currentRole === 'admin') {
              if (auth !== 1) {
                dh += '<button class="rb" style="background:rgba(57,255,20,0.1);border-color:var(--accent3);color:var(--accent3);padding:3px 8px;font-size:11px" onclick="setSyslogDeviceAuth(\'' + d.olt_hostname + '\', 1)">Accept</button>';
              }
              if (auth !== 2) {
                dh += '<button class="rb" style="background:rgba(255,107,53,0.1);border-color:var(--accent2);color:var(--accent2);padding:3px 8px;font-size:11px" onclick="setSyslogDeviceAuth(\'' + d.olt_hostname + '\', 2)">Deny</button>';
              }
            }
            dh += '</div>';
            if (currentRole === 'admin') {
              dh += '<button class="dbtn" style="padding:3px 8px;font-size:11px" onclick="deleteSyslogDevice(\'' + d.olt_hostname + '\')">Delete</button>';
            }
            dh += '</div></div>';
          });
          sdg.innerHTML = dh;
        }

        // Syslog stats
        document.getElementById('sysTotal').textContent = syslog.length;
        document.getElementById('sysAuth').textContent = sysEvts.filter(function (s) { return s.event_tag === 'USER_LOGIN' || s.event_tag === 'USER_LOGOUT' || s.event_tag === 'LOGIN_FAILED'; }).length;
        document.getElementById('sysLink').textContent = sysEvts.filter(function (s) { return s.event_tag === 'UPLINK_UP' || s.event_tag === 'UPLINK_DOWN'; }).length;
        document.getElementById('sysEvtCount').textContent = sysEvts.length + ' events';
        document.getElementById('sysAllCount').textContent = syslog.length + ' msgs';
        if (sysEvts.length) {
          document.getElementById('sysLast').textContent = new Date(sysEvts[0].timestamp).toLocaleTimeString();
          document.getElementById('sysLastTag').textContent = sysEvts[0].event_tag || 'GENERAL';
        }

        sysEventChart.data.labels = sysSumm.slice(0, 8).map(function (s) { return s.event_tag || 'GENERAL'; });
        sysEventChart.data.datasets[0].data = sysSumm.slice(0, 8).map(function (s) { return s.count; });
        sysEventChart.update('none');
        document.getElementById('evtCount').textContent = sysSumm.length + ' types';
        sysSevChart.data.labels = sysSev.map(function (s) { return s.severity; });
        sysSevChart.data.datasets[0].data = sysSev.map(function (s) { return s.count; });
        sysSevChart.update('none');
        document.getElementById('sevCount').textContent = sysSev.length + ' levels';

        // Load first page of events for the Next/Prev UX
        loadSysEventsPage(0);

        var satTb = document.getElementById('sysAllTable');
        if (!syslog.length) { satTb.innerHTML = '<tr><td colspan="8"><div class="empty">No syslog yet.</div></td></tr>'; }
        else {
          var r3 = '';
          syslog.slice(0, 50).forEach(function (e) {
            r3 += '<tr><td class="mu">' + e.id + '</td><td class="mu">' + new Date(e.timestamp).toLocaleTimeString() + '</td>';
            r3 += '<td>' + oltBadge(e.olt_hostname || e.source_ip) + '</td><td><span class="b bc">' + (e.source_ip || 'â€”') + '</span></td>';
            r3 += '<td>' + sevBadge(e.severity) + '</td><td class="mu">' + (e.onu_pon || 'â€”') + '</td>';
            r3 += '<td style="color:var(--accent2);font-size:10px">' + (e.onu_sn || 'â€”') + '</td>';
            r3 += '<td class="mu" style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + (e.message || '') + '</td></tr>';
          });
          satTb.innerHTML = r3;
        }

        // OLT devices tab
        var devGrid = document.getElementById('devGrid');
        document.getElementById('devCount').textContent = devices.length + ' devices';
        if (!devices.length) { devGrid.innerHTML = '<div class="empty">No OLTs seen yet.</div>'; }
        else {
          var dv = '';
          devices.forEach(function (d) {
            var nm = (d.name && d.name !== d.olt_id) ? d.name : d.olt_id;
            var seen = d.last_seen ? new Date(d.last_seen).toLocaleString() : 'Never';
            var mid = (d.olt_mac || '').replace(/:/g, '_');
            var st = d.status || 'unknown';
            var cur = (d.name && d.name !== d.olt_id) ? d.name : '';
            dv += '<div class="oc ' + st + '">';
            dv += '<div class="otop"><div><div class="oname">' + nm + '</div><div style="margin-top:3px">' + oltBadge(d.olt_id) + '</div></div>';
            dv += '<div class="pill ' + st + '">' + st + '</div></div>';
            dv += '<div class="om">MAC: <span>' + (d.olt_mac || 'â€”') + '</span></div>';
            dv += '<div class="om">IP: <span>' + (d.source_ip || 'â€”') + '</span></div>';
            dv += '<div class="om">Last seen: <span>' + seen + '</span></div>';
            dv += '<div class="rrow"><input class="ri" id="inp_' + mid + '" placeholder="Set OLT name..." value="' + cur + '"/>';
            dv += '<button class="rb" data-mac="' + d.olt_mac + '" onclick="renameDevice(this.dataset.mac)">Save</button></div></div>';
          });
          devGrid.innerHTML = dv;
        }

        document.getElementById('upd').textContent = 'Updated ' + new Date().toLocaleTimeString();
        setTftpPortLabels(currentPortSettings.tftp_port);

      }).catch(function (e) {
        if (e.message === '401') return;
        var eb = document.getElementById('errBanner');
        if (eb) { eb.textContent = 'API error: ' + e.message; eb.classList.add('show'); }
        document.getElementById('upd').textContent = 'Error';
      });
    }

    loadTheme();
    initCharts();
    applyChartsTheme();
    loadTabOrder();
    renderUserTabCheckboxes('nuVisibleTabs');
    renderUserTabCheckboxes('euVisibleTabs');
    renderSettingsTabCheckboxes();
    updateAlertRuleSourceUI();
    setUserTabSelections('nuVisibleTabs', getDefaultTabsForRole('viewer'));
    setUserTabSelections('euVisibleTabs', getDefaultTabsForRole('viewer'));
    document.getElementById('nuRole').addEventListener('change', function () {
      setUserTabSelections('nuVisibleTabs', getDefaultTabsForRole(this.value));
      syncUserTabAvailability('nuVisibleTabs', this.value);
    });
    document.getElementById('euRole').addEventListener('change', function () {
      setUserTabSelections('euVisibleTabs', getDefaultTabsForRole(this.value));
      syncUserTabAvailability('euVisibleTabs', this.value);
    });
    apiFetch('/api/settings/ports').then(function (p) {
      currentPortSettings = p || {};
      setTftpPortLabels(p.tftp_port);
    }).catch(function () { /* ignore */ });
    loadUserInfo();
    refreshDashboardHealth();
    fetchAll();
    fetchPing();
    setInterval(refreshDashboardHealth, 5000);
    setInterval(fetchAll, 10000);
    setInterval(fetchPing, 10000);
  

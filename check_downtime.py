import os
import datetime
import re

# Path to the log directory
LOG_DIR = r"e:\antigravity\logs"
LOG_FILE = "API_and_Dashboard.log"

def analyze_gaps(log_path, gap_threshold_minutes=5):
    if not os.path.exists(log_path):
        print(f"File not found: {log_path}")
        return

    # Pattern for timestamp [YYYY-MM-DD HH:MM:SS]
    pattern = re.compile(r'^\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\]')
    
    last_ts = None
    gaps = []

    print(f"Analyzing gaps > {gap_threshold_minutes} minutes in {log_path}...")
    
    try:
        with open(log_path, 'r', encoding='utf-8', errors='replace') as f:
            for line in f:
                match = pattern.match(line)
                if match:
                    ts_str = match.group(1)
                    try:
                        current_ts = datetime.datetime.strptime(ts_str, '%Y-%m-%d %H:%M:%S')
                    except ValueError:
                        continue
                    
                    if last_ts:
                        diff = (current_ts - last_ts).total_seconds() / 60.0
                        if diff >= gap_threshold_minutes:
                            gaps.append((last_ts, current_ts, diff))
                    
                    last_ts = current_ts
    except Exception as e:
        print(f"Error reading log: {e}")
        return

    if not gaps:
        print("No significant gaps found.")
    else:
        print(f"\nFound {len(gaps)} gaps:")
        print(f"{'Start Time':<20} | {'End Time':<20} | {'Duration (min)':<15}")
        print("-" * 60)
        for start, end, duration in gaps:
            print(f"{start.strftime('%Y-%m-%d %H:%M:%S'):<20} | {end.strftime('%Y-%m-%d %H:%M:%S'):<20} | {duration:<15.1f}")
        
        total_downtime = sum(g[2] for g in gaps)
        print("-" * 60)
        print(f"Total identified downtime: {total_downtime:.1f} minutes")

if __name__ == "__main__":
    path = os.path.join(LOG_DIR, LOG_FILE)
    analyze_gaps(path)
    input("\nPress Enter to exit...")

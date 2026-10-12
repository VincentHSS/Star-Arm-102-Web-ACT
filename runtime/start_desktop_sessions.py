"""Start the installed runtime in active Ubuntu desktop user sessions."""
import os
try:
    import pwd
except ImportError:
    pwd = None
import subprocess


def desktop_users(runner=subprocess.run, lookup=None):
    lookup = lookup or pwd.getpwuid
    listed = runner(['/usr/bin/loginctl', 'list-sessions', '--no-legend', '--no-pager'],
                    capture_output=True, text=True, timeout=10, check=False)
    if listed.returncode:
        return []
    users = {}
    for line in listed.stdout.splitlines():
        fields = line.split()
        if not fields:
            continue
        session = fields[0]
        details = runner(['/usr/bin/loginctl', 'show-session', session, '-p', 'Active', '-p', 'Type', '-p', 'Class', '-p', 'User'],
                         capture_output=True, text=True, timeout=10, check=False)
        if details.returncode:
            continue
        properties = dict(line.split('=', 1) for line in details.stdout.splitlines() if '=' in line)
        if properties.get('Active') != 'yes' or properties.get('Type') not in ('x11', 'wayland') or properties.get('Class') != 'user':
            continue
        try:
            uid = int(properties['User'])
            if uid <= 0:
                continue
            account = lookup(uid)
            users[uid] = account.pw_name
        except (KeyError, ValueError):
            continue
    return sorted(users.items())


def start_users(runner=subprocess.run, lookup=None):
    failures = []
    for uid, name in desktop_users(runner, lookup):
        result = runner(['/usr/sbin/runuser', '-u', name, '--', '/usr/bin/star-arm-act-launch', '--background'],
                        capture_output=True, text=True, timeout=25, check=False,
                        env={'PATH': '/usr/sbin:/usr/bin:/sbin:/bin', 'LANG': 'C.UTF-8', 'PYTHONUTF8': '1'})
        if result.returncode:
            failures.append((uid, (result.stderr or result.stdout or 'runtime start failed').strip()))
    return failures


def main():
    if os.geteuid() != 0:
        raise SystemExit('This installer helper must run through the system package installer.')
    try:
        failures = start_users()
        for uid, error in failures:
            print(f'ACT automatic start for desktop user {uid}: {error}')
    except (OSError, subprocess.SubprocessError) as error:
        print(f'ACT will start on the next desktop login: {error}')


if __name__ == '__main__':
    main()

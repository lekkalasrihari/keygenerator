// prepare-win.js
const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync, spawnSync } = require('child_process');

const vendor = path.join(process.cwd(), 'vendor');
const cache = path.join(vendor, 'cache');
const gitDir = path.join(vendor, 'git');
const gpgDir = path.join(vendor, 'gnupg');

fs.mkdirSync(cache, { recursive: true });
fs.mkdirSync(gitDir, { recursive: true });
fs.mkdirSync(gpgDir, { recursive: true });

// URLs
const MIN_GIT_URL = 'https://github.com/git-for-windows/git/releases/download/v2.45.2.windows.1/MinGit-2.45.2-64-bit.zip';

// Helper: download file with redirect support
function fetch(url, dest, redirects = 5) {
    return new Promise((resolve, reject) => {
        const go = (u, n) => {
            const f = fs.createWriteStream(dest);
            const req = https.get(u, res => {
                if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
                    f.close();
                    fs.unlink(dest, () => {});
                    if (!res.headers.location) return reject(new Error('Redirect without location'));
                    if (n <= 0) return reject(new Error('Too many redirects'));
                    return go(res.headers.location, n - 1);
                }
                if (res.statusCode !== 200) {
                    f.close();
                    fs.unlink(dest, () => {});
                    return reject(new Error('HTTP ' + res.statusCode));
                }
                res.pipe(f);
                f.on('finish', () => f.close(resolve));
            });
            req.on('error', err => {
                try { fs.unlinkSync(dest) } catch {}
                reject(err);
            });
        };
        go(url, redirects);
    });
}

// Helper: find 7-Zip
function find7za() {
    const c = [
        path.join(process.cwd(), 'node_modules', '7zip-bin', 'win', 'x64', '7za.exe'),
        '7z',
        '7za'
    ];
    for (const x of c) {
        try {
            const r = spawnSync(x, ['-h'], { shell: true });
            if (r.status === 0 || (r.stdout && r.stdout.toString().length > 0)) return x;
        } catch {}
    }
    return null;
}

// Helper: extract ZIP with 7-Zip
function extract(archive, out) {
    const seven = find7za();
    if (!seven) throw new Error('7zip not available');
    fs.mkdirSync(out, { recursive: true });
    const r = spawnSync(seven, ['x', '-y', archive, `-o${out}`], { stdio: 'inherit', shell: true });
    if (r.status !== 0) throw new Error('7zip extraction failed');
}

// Helper: extract ZIP with PowerShell fallback
function extractWithPowerShell(archive, out) {
    fs.mkdirSync(out, { recursive: true });
    execSync(`powershell -NoProfile -ExecutionPolicy Bypass -Command "Expand-Archive -Force -Path '${archive.replace(/'/g,"''")}' -DestinationPath '${out.replace(/'/g,"''")}'"`, { stdio: 'inherit' });
}

(async () => {
    try {
        // --- MinGit ---
        const gitZip = path.join(cache, 'mingit.zip');
        if (!fs.existsSync(gitZip)) {
            console.log('Downloading MinGit...');
            await fetch(MIN_GIT_URL, gitZip);
        } else console.log('Using cached', gitZip);

        console.log('Extracting MinGit...');
        if (fs.readdirSync(gitDir).length === 0) {
            try {
                extract(gitZip, gitDir);
            } catch {
                console.log('7-Zip extraction failed, using PowerShell fallback');
                extractWithPowerShell(gitZip, gitDir);
            }
        } else console.log('MinGit already extracted');

        // --- GnuPG ---
        const gpgExe = path.join(cache, 'gnupg.exe');
        if (!fs.existsSync(gpgExe)) {
            console.warn('GnuPG not found in vendor/cache!');
            console.warn('Please download gnupg-w32-*.exe from https://gnupg.org/download/index.html');
            console.warn('and place it as vendor/cache/gnupg.exe');
            process.exitCode = 1;
            return;
        }

        console.log('Preparing GnuPG...');
        if (fs.readdirSync(gpgDir).length === 0) {
            console.log('GnuPG EXE detected, skipping extraction.');
            console.log('Make sure GnuPG is installed or binaries are in PATH.');
        } else console.log('GnuPG already prepared');

        console.log('Vendor preparation done.');
    } catch (e) {
        console.error('Vendor prep failed:', e.message);
        console.error('Ensure MinGit ZIP and GnuPG EXE are in vendor/cache.');
        process.exitCode = 1;
    }
})();

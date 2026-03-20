const https = require('https');
const fs    = require('fs');
const path  = require('path');

const DEST = path.join(__dirname, '..', 'public', 'vc_redist.x64.exe');
const MIN_SIZE = 20 * 1024 * 1024;

if (fs.existsSync(DEST) && fs.statSync(DEST).size > MIN_SIZE) {
  const mb = (fs.statSync(DEST).size / 1024 / 1024).toFixed(1);
  console.log('[vcredist] Ja existe (' + mb + ' MB) — pulando download.');
  process.exit(0);
}

console.log('[vcredist] Baixando Visual C++ Redistributable 2022 x64...');

function download(url, dest, redirects) {
  if (redirects > 5) { console.error('[vcredist] Muitos redirecionamentos'); process.exit(0); }

  // Extrai host e path manualmente sem usar new URL()
  var m = url.match(/^https:\/\/([^\/]+)(\/.*)?$/);
  if (!m) { console.error('[vcredist] URL invalida:', url); process.exit(0); }
  var hostname = m[1];
  var urlpath  = m[2] || '/';

  var options = {
    hostname: hostname,
    path: urlpath,
    headers: { 'User-Agent': 'Mozilla/5.0' },
    timeout: 60000,
  };

  var req = https.get(options, function(res) {
    if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 303) {
      console.log('[vcredist] Redirecionando...');
      res.resume();
      return download(res.headers.location, dest, redirects + 1);
    }
    if (res.statusCode !== 200) {
      console.error('[vcredist] Erro HTTP', res.statusCode, '— continuando sem VC++');
      res.resume();
      process.exit(0);
    }

    var total = parseInt(res.headers['content-length'] || '0');
    var downloaded = 0;
    var file = fs.createWriteStream(dest);

    res.on('data', function(chunk) {
      downloaded += chunk.length;
      if (total > 0) {
        var pct = Math.round((downloaded / total) * 100);
        process.stdout.write('\r[vcredist] ' + pct + '% (' + (downloaded/1024/1024).toFixed(1) + ' MB)');
      }
    });

    res.pipe(file);

    file.on('finish', function() {
      file.close(function() {
        console.log('\n[vcredist] Concluido: ' + (fs.statSync(dest).size/1024/1024).toFixed(1) + ' MB');
        process.exit(0);
      });
    });

    file.on('error', function(err) {
      console.error('\n[vcredist] Erro ao salvar:', err.message);
      try { fs.unlinkSync(dest); } catch(e) {}
      process.exit(0);
    });
  });

  req.on('timeout', function() {
    console.error('\n[vcredist] Timeout — continuando sem VC++');
    req.destroy();
    process.exit(0);
  });

  req.on('error', function(err) {
    console.error('\n[vcredist] Erro de rede:', err.message);
    console.log('[vcredist] Baixe manualmente: https://aka.ms/vs/17/release/vc_redist.x64.exe');
    console.log('[vcredist] Salve em: public/vc_redist.x64.exe');
    process.exit(0);
  });
}

download('https://aka.ms/vs/17/release/vc_redist.x64.exe', DEST, 0);

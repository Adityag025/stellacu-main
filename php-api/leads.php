<?php
/**
 * Private leads page: https://stellacumedia.com/leads (routed by .htaccess)
 *
 * Shows every enquiry and newsletter signup saved by the form API, and the
 * backend's activity log, with search, paging and CSV download. Protected by a password whose hash is
 * leads_password_hash in config.local.php. Not indexed by search engines.
 */

declare(strict_types=1);

require __DIR__ . '/_bootstrap.php';

const PAGE_SIZE = 50;
const LOGIN_ATTEMPTS = 5;            // wrong passwords per visitor
const LOGIN_WINDOW_SECONDS = 900;    // 15 minutes

header('X-Robots-Tag: noindex, nofollow');
header('Cache-Control: no-store');
header('X-Frame-Options: DENY');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: no-referrer');
$nonce = base64_encode(random_bytes(16));
header("Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-{$nonce}'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'");

session_name('stellacu_leads');
session_set_cookie_params(['lifetime' => 0, 'path' => '/leads', 'secure' => true, 'httponly' => true, 'samesite' => 'Strict']);
session_start();

$config = api_config();
$csrf = $_SESSION['csrf'] ??= bin2hex(random_bytes(16));

function e(string $s): string
{
    return htmlspecialchars($s, ENT_QUOTES, 'UTF-8');
}

function post_ok(string $csrf): bool
{
    return ($_SERVER['REQUEST_METHOD'] ?? '') === 'POST' && hash_equals($csrf, (string) ($_POST['csrf'] ?? ''));
}

// --- Log in / log out -------------------------------------------------------
$error = '';
if (post_ok($csrf) && isset($_POST['logout'])) {
    log_event('info', 'leads_sign_out');
    $_SESSION = [];
    session_destroy();
    header('Location: /leads', true, 303);
    exit;
}
if (post_ok($csrf) && isset($_POST['password'])) {
    try {
        // Only wrong passwords count towards the lock-out; signing in does not.
        enforce_rate_limit($config, 'leads-login', LOGIN_ATTEMPTS, LOGIN_WINDOW_SECONDS, false);
        if ($config['leads_password_hash'] !== '' && password_verify((string) $_POST['password'], $config['leads_password_hash'])) {
            session_regenerate_id(true);
            $_SESSION['signed_in'] = true;
            log_event('info', 'leads_sign_in');
            header('Location: /leads', true, 303);
            exit;
        }
        record_attempt('leads-login', LOGIN_WINDOW_SECONDS);
        $error = 'Wrong password.';
        log_event('warning', 'leads_wrong_password');
    } catch (HttpError $err) {
        $error = 'Too many attempts. Try again in 15 minutes.';
        log_event('warning', 'leads_sign_in_locked');
    }
}
$signedIn = !empty($_SESSION['signed_in']);

// --- Data -------------------------------------------------------------------
$tab = in_array($_GET['tab'] ?? '', ['subscribers', 'activity_log'], true) ? $_GET['tab'] : 'leads';
$q = trim((string) ($_GET['q'] ?? ''));
$page = max(1, (int) ($_GET['page'] ?? 1));

$columns = match ($tab) {
    'leads' => ['created_at' => 'Received (IST)', 'form' => 'Form', 'name' => 'Name', 'email' => 'Email', 'phone' => 'Phone', 'company' => 'Company', 'website' => 'Website', 'budget' => 'Budget', 'message' => 'Message', 'page' => 'Page', 'email_status' => 'Email status'],
    'subscribers' => ['created_at' => 'Signed up (IST)', 'email' => 'Email', 'page' => 'Page', 'delivery_status' => 'Delivered'],
    'activity_log' => ['created_at' => 'Time (IST)', 'level' => 'Level', 'event' => 'Event', 'source' => 'Source', 'detail' => 'Detail', 'visitor' => 'Visitor'],
};
$searchable = match ($tab) {
    'leads' => ['name', 'email', 'phone', 'company', 'website', 'message', 'form'],
    'subscribers' => ['email', 'page'],
    'activity_log' => ['level', 'event', 'source', 'detail', 'visitor'],
};

/** Stored times are UTC; the team works in India, so show them in IST. */
function local_time(string $utc, string $format = 'j M Y, H:i'): string
{
    if ($utc === '') {
        return '';
    }
    return (new DateTimeImmutable($utc, new DateTimeZone('UTC')))->setTimezone(new DateTimeZone('Asia/Kolkata'))->format($format);
}

function form_label(string $key): string
{
    return ['growth-audit' => 'Growth Audit', 'landing-1' => 'Landing page 1', 'landing-2' => 'Landing page 2'][$key] ?? $key;
}

/** Value as shown in the table and the CSV (dates in IST, readable form names). */
function display_value(string $col, string $v, bool $forCsv = false): string
{
    return match ($col) {
        'created_at' => local_time($v, $forCsv ? 'Y-m-d H:i' : 'j M Y, H:i'),
        'form' => form_label($v),
        default => $v,
    };
}

/** Table layout per tab: header => cell renderer. The sheet shows every column. */
function table_layout(string $tab): array
{
    $text = static fn (string $v, string $class = ''): string => $v === '' ? '<span class="dim">—</span>' : '<span class="' . $class . '">' . e($v) . '</span>';
    $mail = static fn (string $v): string => $v === '' ? '' : '<a href="mailto:' . e($v) . '">' . e($v) . '</a>';
    $tel = static fn (string $v): string => $v === '' ? '' : '<a href="tel:' . e(preg_replace('/[^\d+]/', '', $v)) . '">' . e($v) . '</a>';
    $site = static fn (string $v): string => $v === '' ? '' : '<a href="' . e($v) . '" target="_blank" rel="noopener noreferrer">' . e((string) (parse_url($v, PHP_URL_HOST) ?: $v)) . '</a>';
    $stack = static fn (string $top, string $bottom): string => '<div class="stack">' . ($top !== '' ? $top : '<span class="dim">—</span>') . ($bottom !== '' ? '<div class="sub">' . $bottom . '</div>' : '') . '</div>';
    $capsule = static fn (string $v): string => '<span class="capsule capsule-' . e($v) . '">' . e($v) . '</span>';
    $time = static fn (string $v): string => '<span class="muted" title="' . e($v) . ' UTC">' . e(local_time($v)) . '</span>';

    return match ($tab) {
        'leads' => [
            'Lead' => static fn (array $r): string => $stack('<strong>' . e($r['name']) . '</strong>', e(form_label($r['form']))),
            'Contact' => static fn (array $r): string => $stack($mail($r['email']), $tel($r['phone'])),
            'Company' => static fn (array $r): string => $stack(e($r['company']), $site($r['website'])),
            'Budget' => static fn (array $r): string => $text($r['budget']),
            'Status' => static fn (array $r): string => $capsule($r['email_status']),
            'Received' => static fn (array $r): string => $time($r['created_at']),
        ],
        'subscribers' => [
            'Email' => static fn (array $r): string => $mail($r['email']),
            'Page' => static fn (array $r): string => $text($r['page'], 'muted'),
            'Status' => static fn (array $r): string => $capsule($r['delivery_status']),
            'Signed up' => static fn (array $r): string => $time($r['created_at']),
        ],
        'activity_log' => [
            'Time' => static fn (array $r): string => $time($r['created_at']),
            'Level' => static fn (array $r): string => $capsule($r['level']),
            'Event' => static fn (array $r): string => $stack('<strong>' . e($r['event']) . '</strong>', e($r['source'])),
            'Detail' => static fn (array $r): string => $r['detail'] === '' ? '<span class="dim">—</span>' : '<div class="clamp">' . e($r['detail']) . '</div>',
            'Visitor' => static fn (array $r): string => '<span class="mono">' . e($r['visitor']) . '</span>',
        ],
    };
}

/** @return array{0: string, 1: array} WHERE clause and parameters for the search box. */
function search_clause(array $searchable, string $q): array
{
    if ($q === '') {
        return ['', []];
    }
    $parts = [];
    $params = [];
    foreach ($searchable as $i => $col) {
        $parts[] = "{$col} LIKE :q{$i}";
        $params["q{$i}"] = '%' . addcslashes($q, '%_\\') . '%';
    }
    return [' WHERE ' . implode(' OR ', $parts), $params];
}

$rows = [];
$total = 0;
$dbError = '';
if ($signedIn) {
    if (!db_configured($config)) {
        $dbError = 'The database is not set up yet (db_* settings in php-api/config.local.php).';
    } else {
        try {
            [$where, $params] = search_clause($searchable, $q);
            $count = db()->prepare("SELECT COUNT(*) FROM {$tab}{$where}");
            $count->execute($params);
            $total = (int) $count->fetchColumn();

            // CSV download of everything matching the search.
            if (($_GET['export'] ?? '') === 'csv') {
                log_event('info', 'leads_csv_download', $tab . ($q !== '' ? ', filtered' : '') . ", {$total} rows");
                $stmt = db()->prepare('SELECT ' . implode(', ', array_keys($columns)) . " FROM {$tab}{$where} ORDER BY created_at DESC, id DESC");
                $stmt->execute($params);
                header('Content-Type: text/csv; charset=utf-8');
                header('Content-Disposition: attachment; filename="stellacu-' . $tab . '-' . gmdate('Y-m-d') . '.csv"');
                $out = fopen('php://output', 'w');
                fwrite($out, "\xEF\xBB\xBF"); // UTF-8 BOM so Excel shows accents correctly
                fputcsv($out, array_values($columns));
                while ($r = $stmt->fetch()) {
                    $line = [];
                    foreach ($r as $col => $v) {
                        $v = display_value($col, (string) $v, true);
                        // Stop spreadsheet formulas from running (e.g. a "name" starting with "=").
                        $line[] = preg_match('/^[=+\-@\t\r]/', $v) ? "'" . $v : $v;
                    }
                    fputcsv($out, $line);
                }
                fclose($out);
                exit;
            }

            $stmt = db()->prepare('SELECT ' . implode(', ', array_keys($columns)) . " FROM {$tab}{$where} ORDER BY created_at DESC, id DESC LIMIT " . PAGE_SIZE . ' OFFSET ' . (($page - 1) * PAGE_SIZE));
            $stmt->execute($params);
            $rows = $stmt->fetchAll();
        } catch (Throwable $err) {
            error_log('[leads] ' . $err->getMessage());
            $dbError = 'Could not read the database. Check the db_* settings.';
        }
    }
}
$pages = max(1, (int) ceil($total / PAGE_SIZE));
$link = static fn (array $extra): string => '/leads?' . http_build_query(array_filter(['tab' => $tab, 'q' => $q] + $extra, static fn ($v) => $v !== '' && $v !== null));

header('Content-Type: text/html; charset=utf-8');
$countLabel = match ($tab) {
    'leads' => $total . ' ' . ($total === 1 ? 'enquiry' : 'enquiries'),
    'subscribers' => $total . ' ' . ($total === 1 ? 'signup' : 'signups'),
    default => $total . ' ' . ($total === 1 ? 'entry' : 'entries') . ' · kept ' . LOG_RETENTION_DAYS . ' days',
};
$tabTitle = ['leads' => 'Enquiries', 'subscribers' => 'Newsletter', 'activity_log' => 'Activity'][$tab];
?>
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<meta name="color-scheme" content="light dark">
<title>Leads · StellAcu Media</title>
<style>
  /* Apple Human Interface Guidelines: system font, grouped backgrounds,
     system colours, segmented control, inset grouped lists, sheets. */
  :root {
    --bg:#f2f2f7; --surface:#fff; --elevated:#fff; --label:#1d1d1f; --secondary:rgba(60,60,67,.6); --tertiary:rgba(60,60,67,.3);
    --separator:rgba(60,60,67,.14); --fill:rgba(118,118,128,.12); --fill-strong:rgba(118,118,128,.2); --hover:rgba(0,0,0,.03);
    --blue:#007aff; --green:#248a3d; --green-bg:rgba(52,199,89,.14); --red:#d70015; --red-bg:rgba(255,59,48,.12);
    --orange:#c93400; --orange-bg:rgba(255,149,0,.14); --gray-bg:rgba(118,118,128,.12);
    --bar:rgba(242,242,247,.8); --shadow:0 1px 2px rgba(0,0,0,.04), 0 8px 24px rgba(0,0,0,.06);
    --ease:cubic-bezier(.32,.72,0,1);
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg:#000; --surface:#1c1c1e; --elevated:#2c2c2e; --label:#f5f5f7; --secondary:rgba(235,235,245,.6); --tertiary:rgba(235,235,245,.3);
      --separator:rgba(84,84,88,.55); --fill:rgba(118,118,128,.24); --fill-strong:rgba(118,118,128,.36); --hover:rgba(255,255,255,.04);
      --blue:#0a84ff; --green:#30d158; --green-bg:rgba(48,209,88,.16); --red:#ff453a; --red-bg:rgba(255,69,58,.16);
      --orange:#ff9f0a; --orange-bg:rgba(255,159,10,.16); --gray-bg:rgba(118,118,128,.24);
      --bar:rgba(0,0,0,.72); --shadow:none;
    }
  }
  * { box-sizing:border-box; }
  html { -webkit-text-size-adjust:100%; }
  body { margin:0; background:var(--bg); color:var(--label);
         font:15px/1.47 -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif;
         letter-spacing:-.01em; -webkit-font-smoothing:antialiased; }
  a { color:var(--blue); text-decoration:none; }
  a:hover { text-decoration:underline; }
  button { font:inherit; letter-spacing:inherit; }
  :focus-visible { outline:3px solid color-mix(in srgb, var(--blue) 45%, transparent); outline-offset:2px; }

  /* Navigation bar */
  .navbar { position:sticky; top:0; z-index:10; background:var(--bar); backdrop-filter:saturate(180%) blur(20px); -webkit-backdrop-filter:saturate(180%) blur(20px);
            border-bottom:.5px solid var(--separator); }
  .navbar-inner { max-width:1280px; margin:0 auto; height:52px; padding:0 24px; display:flex; align-items:center; justify-content:space-between; }
  .brand { font-weight:600; font-size:15px; display:flex; align-items:center; gap:10px; }
  .brand-mark { width:26px; height:26px; border-radius:7px; background:linear-gradient(135deg,#0a84ff,#004990); color:#fff;
                display:grid; place-items:center; font-size:13px; font-weight:700; }
  .nav-actions { display:flex; align-items:center; gap:6px; }
  .plain { background:none; border:0; color:var(--blue); padding:6px 10px; border-radius:8px; cursor:pointer; font-size:15px; }
  .plain:hover { background:var(--fill); text-decoration:none; }

  .page { max-width:1280px; margin:0 auto; padding:28px 24px 64px; }
  .large-title { font-size:34px; line-height:1.12; font-weight:700; letter-spacing:-.022em; margin:0; }
  .subtitle { color:var(--secondary); margin:6px 0 0; font-size:15px; }

  /* Toolbar: segmented control + search */
  .toolbar { display:flex; flex-wrap:wrap; gap:12px; align-items:center; justify-content:space-between; margin:22px 0 16px; }
  .segmented { display:inline-flex; padding:2px; background:var(--fill); border-radius:9px; }
  .segmented a { padding:6px 18px; border-radius:7px; color:var(--label); font-size:13px; font-weight:500; text-decoration:none; transition:background .2s; white-space:nowrap; }
  .segmented a:hover { background:var(--fill); }
  .segmented a[aria-current="page"] { background:var(--elevated); font-weight:600; box-shadow:0 1px 1px rgba(0,0,0,.04), 0 3px 8px rgba(0,0,0,.12); }
  .search { position:relative; flex:1; max-width:360px; min-width:220px; }
  .search svg { position:absolute; left:10px; top:50%; transform:translateY(-50%); width:15px; height:15px; color:var(--secondary); pointer-events:none; }
  .search input { width:100%; height:36px; border:0; border-radius:10px; background:var(--fill); color:var(--label); padding:0 12px 0 32px; font:inherit; font-size:15px; }
  .search input::placeholder { color:var(--secondary); }
  .search input:focus { outline:none; box-shadow:0 0 0 3px color-mix(in srgb, var(--blue) 35%, transparent); }

  /* Inset grouped table */
  .group { background:var(--surface); border-radius:14px; box-shadow:var(--shadow); overflow:hidden; }
  .scroller { overflow:auto; max-height:calc(100vh - 230px); }
  table { width:100%; border-collapse:separate; border-spacing:0; font-size:14px; }
  th { position:sticky; top:0; z-index:1; background:var(--surface); text-align:left; font-size:12px; font-weight:600; color:var(--secondary);
       padding:12px 16px 10px; white-space:nowrap; border-bottom:.5px solid var(--separator); }
  td { padding:13px 16px; white-space:nowrap; vertical-align:top; border-bottom:.5px solid var(--separator); }
  tbody tr:last-child td { border-bottom:0; }
  tr.row { cursor:pointer; transition:background .15s; }
  tr.row:hover td, tr.row:focus-visible td { background:var(--hover); }
  tr.row:focus-visible { outline:none; }
  td strong { font-weight:600; }
  .stack .sub { color:var(--secondary); font-size:13px; margin-top:2px; }
  .stack .sub a { color:var(--secondary); }
  .muted, .dim { color:var(--secondary); }
  .clamp { white-space:normal; min-width:240px; max-width:460px; overflow:hidden; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; }
  .mono { font-family:ui-monospace, "SF Mono", Menlo, Consolas, monospace; font-size:12px; color:var(--secondary); }
  td:last-child { text-align:right; }
  th:last-child { text-align:right; }

  /* Status capsules */
  .capsule { display:inline-flex; align-items:center; gap:6px; padding:3px 10px 3px 8px; border-radius:999px; font-size:12px; font-weight:600; text-transform:capitalize; }
  .capsule::before { content:""; width:6px; height:6px; border-radius:50%; background:currentColor; }
  .capsule-sent { color:var(--green); background:var(--green-bg); }
  .capsule-failed, .capsule-error { color:var(--red); background:var(--red-bg); }
  .capsule-warning { color:var(--orange); background:var(--orange-bg); }
  .capsule-pending, .capsule-info { color:var(--secondary); background:var(--gray-bg); }

  .empty-state { text-align:center; padding:72px 24px; color:var(--secondary); }
  .empty-state strong { display:block; color:var(--label); font-size:17px; margin-bottom:4px; }
  .notice { color:var(--red); }
  .pager { display:flex; gap:8px; align-items:center; justify-content:center; margin-top:18px; color:var(--secondary); font-size:13px; }
  .pager a { padding:6px 12px; border-radius:8px; background:var(--fill); color:var(--label); }
  .pager a:hover { text-decoration:none; background:var(--fill-strong); }

  /* Sign-in */
  .signin { min-height:100vh; display:grid; place-items:center; padding:24px; }
  .signin-card { width:100%; max-width:380px; background:var(--surface); border-radius:20px; box-shadow:var(--shadow); padding:36px 32px 32px; text-align:center; }
  .signin-card .brand-mark { width:56px; height:56px; border-radius:14px; font-size:24px; margin:0 auto 18px; }
  .signin-card h1 { font-size:22px; font-weight:700; letter-spacing:-.02em; margin:0; }
  .signin-card p { color:var(--secondary); margin:6px 0 24px; }
  .field { width:100%; height:44px; border:0; border-radius:12px; background:var(--fill); color:var(--label); padding:0 14px; font:inherit; font-size:17px; }
  .field:focus { outline:none; box-shadow:0 0 0 3px color-mix(in srgb, var(--blue) 35%, transparent); }
  .filled { width:100%; height:44px; margin-top:12px; border:0; border-radius:12px; background:var(--blue); color:#fff; font-size:17px; font-weight:600; cursor:pointer; }
  .filled:hover { filter:brightness(1.06); }
  .signin-error { color:var(--red); font-size:13px; margin:12px 0 0; }

  /* Sheet sliding in from the left */
  .scrim { position:fixed; inset:0; z-index:20; background:rgba(0,0,0,.28); backdrop-filter:blur(2px); -webkit-backdrop-filter:blur(2px);
           opacity:0; pointer-events:none; transition:opacity .35s var(--ease); }
  .scrim.open { opacity:1; pointer-events:auto; }
  .sheet { position:fixed; z-index:21; top:10px; bottom:10px; left:10px; width:min(420px, calc(100vw - 20px));
           background:var(--bg); border-radius:18px; display:flex; flex-direction:column; overflow:hidden;
           transform:translateX(calc(-100% - 20px)); transition:transform .45s var(--ease); }
  .sheet.open { transform:translateX(0); box-shadow:0 20px 60px rgba(0,0,0,.25); }
  .sheet-head { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:14px 12px 10px 20px; }
  .sheet-head .eyebrow { color:var(--secondary); font-size:13px; }
  .sheet-head h2 { font-size:22px; font-weight:700; letter-spacing:-.02em; margin:2px 0 0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:290px; }
  .sheet-body { overflow-y:auto; padding:6px 16px 24px; }
  .inset { background:var(--surface); border-radius:12px; margin:14px 0 0; }
  .inset-row { display:flex; justify-content:space-between; gap:16px; padding:11px 16px; border-bottom:.5px solid var(--separator); font-size:15px; }
  .inset-row:last-child { border-bottom:0; }
  .inset-row .k { color:var(--label); flex-shrink:0; }
  .inset-row .v { color:var(--secondary); text-align:right; word-break:break-word; }
  .inset-row .v a { color:var(--blue); }
  .inset-title { color:var(--secondary); font-size:13px; text-transform:uppercase; letter-spacing:.02em; margin:20px 16px 6px; }
  .inset-text { padding:12px 16px; white-space:pre-wrap; word-break:break-word; font-size:15px; }
  @media (prefers-reduced-motion: reduce) { .sheet, .scrim, .segmented a, tr.row { transition:none; } }
  @media (max-width:640px) { .page, .navbar-inner { padding-left:16px; padding-right:16px; } .large-title { font-size:28px; } .search { max-width:none; } }
</style>
</head>
<body>
<?php if (!$signedIn): ?>
  <main class="signin">
    <div class="signin-card">
      <div class="brand-mark" aria-hidden="true">S</div>
      <h1>StellAcu Leads</h1>
      <p>Sign in to see enquiries and signups.</p>
      <?php if ($config['leads_password_hash'] === ''): ?>
        <p class="signin-error">No password set yet (leads_password_hash in php-api/config.local.php).</p>
      <?php else: ?>
        <form method="post" action="/leads">
          <input type="hidden" name="csrf" value="<?= e($csrf) ?>">
          <label class="visually-hidden" for="pw" style="position:absolute;left:-9999px">Password</label>
          <input class="field" id="pw" type="password" name="password" placeholder="Password" autocomplete="current-password" required autofocus>
          <button class="filled" type="submit">Sign In</button>
          <?php if ($error !== ''): ?><p class="signin-error" role="alert"><?= e($error) ?></p><?php endif; ?>
        </form>
      <?php endif; ?>
    </div>
  </main>
<?php else: ?>
  <nav class="navbar">
    <div class="navbar-inner">
      <div class="brand"><span class="brand-mark" aria-hidden="true">S</span>StellAcu Leads</div>
      <div class="nav-actions">
        <a class="plain" href="<?= e($link(['export' => 'csv'])) ?>">Export CSV</a>
        <form method="post" action="/leads" style="margin:0"><input type="hidden" name="csrf" value="<?= e($csrf) ?>"><button class="plain" name="logout" value="1">Sign Out</button></form>
      </div>
    </div>
  </nav>

  <main class="page">
    <h1 class="large-title"><?= e($tabTitle) ?></h1>
    <p class="subtitle"><?= e($countLabel) ?><?= $q !== '' ? ' matching “' . e($q) . '”' : '' ?></p>

    <div class="toolbar">
      <div class="segmented" role="tablist">
        <a href="/leads" <?= $tab === 'leads' ? 'aria-current="page"' : '' ?>>Enquiries</a>
        <a href="/leads?tab=subscribers" <?= $tab === 'subscribers' ? 'aria-current="page"' : '' ?>>Newsletter</a>
        <a href="/leads?tab=activity_log" <?= $tab === 'activity_log' ? 'aria-current="page"' : '' ?>>Activity</a>
      </div>
      <form class="search" method="get" action="/leads" role="search">
        <?php if ($tab !== 'leads'): ?><input type="hidden" name="tab" value="<?= e($tab) ?>"><?php endif; ?>
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="7" cy="7" r="5.2"/><path d="m11 11 3.5 3.5"/></svg>
        <input type="search" name="q" value="<?= e($q) ?>" aria-label="Search" placeholder="<?= $tab === 'activity_log' ? 'Search events, errors, warnings' : 'Search name, email, company' ?>">
      </form>
    </div>

    <?php if ($dbError !== ''): ?>
      <div class="group"><div class="empty-state"><strong>Can’t load leads</strong><span class="notice"><?= e($dbError) ?></span></div></div>
    <?php elseif (!$rows): ?>
      <div class="group"><div class="empty-state"><strong><?= $q !== '' ? 'No results' : 'Nothing here yet' ?></strong><?= $q !== '' ? 'Try a different search.' : 'New ' . ($tab === 'activity_log' ? 'activity' : 'submissions') . ' will appear here.' ?></div></div>
    <?php else: ?>
      <div class="group">
        <div class="scroller">
          <table>
            <?php $layout = table_layout($tab); ?>
            <thead><tr><?php foreach (array_keys($layout) as $label): ?><th scope="col"><?= e($label) ?></th><?php endforeach; ?></tr></thead>
            <tbody>
            <?php foreach ($rows as $r):
                $details = [];
                foreach ($columns as $col => $label) {
                    $raw = (string) ($r[$col] ?? '');
                    $details[] = ['col' => $col, 'label' => $label, 'value' => display_value($col, $raw), 'raw' => $raw];
                }
            ?>
              <tr class="row" tabindex="0" data-details="<?= e(json_encode($details, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)) ?>">
              <?php foreach ($layout as $render): $r = array_map(static fn ($v) => (string) $v, $r); ?>
                <td><?= $render($r) ?></td>
              <?php endforeach; ?>
              </tr>
            <?php endforeach; ?>
            </tbody>
          </table>
        </div>
      </div>
      <?php if ($pages > 1): ?>
        <div class="pager">
          <?php if ($page > 1): ?><a href="<?= e($link(['page' => $page - 1])) ?>">‹ Newer</a><?php endif; ?>
          <span>Page <?= $page ?> of <?= $pages ?></span>
          <?php if ($page < $pages): ?><a href="<?= e($link(['page' => $page + 1])) ?>">Older ›</a><?php endif; ?>
        </div>
      <?php endif; ?>
    <?php endif; ?>
  </main>

  <div class="scrim" id="scrim"></div>
  <aside class="sheet" id="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title" aria-hidden="true">
    <div class="sheet-head">
      <div><div class="eyebrow" id="sheet-eyebrow"><?= e($tabTitle) ?></div><h2 id="sheet-title">Details</h2></div>
      <button type="button" class="plain" id="sheet-close" style="font-weight:600">Done</button>
    </div>
    <div class="sheet-body" id="sheet-body"></div>
  </aside>
  <script nonce="<?= e($nonce) ?>">
  (function () {
    var sheet = document.getElementById('sheet');
    var scrim = document.getElementById('scrim');
    var body = document.getElementById('sheet-body');
    var title = document.getElementById('sheet-title');
    var closeBtn = document.getElementById('sheet-close');
    var LONG = ['message', 'detail'];
    var lastRow = null;

    // Links only for safe schemes; every value is inserted as text, never HTML.
    function valueNode(item) {
      var a = document.createElement('a');
      if (item.col === 'email') a.href = 'mailto:' + item.raw;
      else if (item.col === 'phone') a.href = 'tel:' + item.raw.replace(/[^\d+]/g, '');
      else if (item.col === 'website' && /^https?:\/\//i.test(item.raw)) { a.href = item.raw; a.target = '_blank'; a.rel = 'noopener noreferrer'; }
      else return document.createTextNode(item.value || '—');
      a.textContent = item.value;
      return a;
    }

    function el(tag, cls, text) {
      var n = document.createElement(tag);
      if (cls) n.className = cls;
      if (text !== undefined) n.textContent = text;
      return n;
    }

    function open(row) {
      var details = JSON.parse(row.getAttribute('data-details'));
      body.textContent = '';

      var group = el('div', 'inset');
      details.filter(function (i) { return LONG.indexOf(i.col) === -1; }).forEach(function (item) {
        var r = el('div', 'inset-row');
        r.appendChild(el('span', 'k', item.label));
        var v = el('span', 'v');
        if (['email_status', 'delivery_status', 'level'].indexOf(item.col) !== -1 && item.raw) {
          v.appendChild(el('span', 'capsule capsule-' + item.raw, item.raw));
        } else {
          v.appendChild(valueNode(item));
        }
        r.appendChild(v);
        group.appendChild(r);
      });
      body.appendChild(group);

      details.filter(function (i) { return LONG.indexOf(i.col) !== -1; }).forEach(function (item) {
        body.appendChild(el('div', 'inset-title', item.label));
        var box = el('div', 'inset');
        box.appendChild(el('div', 'inset-text', item.value || '—'));
        body.appendChild(box);
      });

      var heading = details.filter(function (i) { return i.col === 'name' || i.col === 'email' || i.col === 'event'; })[0];
      title.textContent = heading && heading.value ? heading.value : 'Details';
      lastRow = row;
      sheet.classList.add('open');
      scrim.classList.add('open');
      sheet.setAttribute('aria-hidden', 'false');
      closeBtn.focus();
    }

    function close() {
      sheet.classList.remove('open');
      scrim.classList.remove('open');
      sheet.setAttribute('aria-hidden', 'true');
      if (lastRow) lastRow.focus();
    }

    document.querySelectorAll('tr.row').forEach(function (row) {
      row.addEventListener('click', function (e) {
        if (e.target.closest('a')) return; // email/phone/website links work directly
        open(row);
      });
      row.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(row); }
      });
    });
    scrim.addEventListener('click', close);
    closeBtn.addEventListener('click', close);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && sheet.classList.contains('open')) close();
    });
  })();
  </script>
<?php endif; ?>
</body>
</html>

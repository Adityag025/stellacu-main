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
const LOGIN_ATTEMPTS = 5;            // per visitor
const LOGIN_WINDOW_SECONDS = 900;    // 15 minutes

header('X-Robots-Tag: noindex, nofollow');
header('Cache-Control: no-store');
header('X-Frame-Options: DENY');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: no-referrer');
header("Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'");

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
        enforce_rate_limit($config, 'leads-login', LOGIN_ATTEMPTS, LOGIN_WINDOW_SECONDS);
        if ($config['leads_password_hash'] !== '' && password_verify((string) $_POST['password'], $config['leads_password_hash'])) {
            session_regenerate_id(true);
            $_SESSION['signed_in'] = true;
            log_event('info', 'leads_sign_in');
            header('Location: /leads', true, 303);
            exit;
        }
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
    'leads' => ['created_at' => 'Received (UTC)', 'form' => 'Form', 'name' => 'Name', 'email' => 'Email', 'phone' => 'Phone', 'company' => 'Company', 'website' => 'Website', 'budget' => 'Budget', 'message' => 'Message', 'page' => 'Page', 'email_status' => 'Email'],
    'subscribers' => ['created_at' => 'Signed up (UTC)', 'email' => 'Email', 'page' => 'Page', 'delivery_status' => 'Delivered'],
    'activity_log' => ['created_at' => 'Time (UTC)', 'level' => 'Level', 'event' => 'Event', 'source' => 'Source', 'detail' => 'Detail', 'visitor' => 'Visitor'],
};
$searchable = match ($tab) {
    'leads' => ['name', 'email', 'phone', 'company', 'website', 'message', 'form'],
    'subscribers' => ['email', 'page'],
    'activity_log' => ['level', 'event', 'source', 'detail', 'visitor'],
};

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
                    // Stop spreadsheet formulas from running (e.g. a "name" starting with "=").
                    fputcsv($out, array_map(static fn ($v) => preg_match('/^[=+\-@\t\r]/', (string) $v) ? "'" . $v : (string) $v, $r));
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
?>
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Leads | StellAcu Media</title>
<style>
  :root { --bg:#f7f5f4; --card:#fff; --text:#161616; --muted:#666; --line:#e4dfdd; --accent:#004990; --bad:#c62828; --ok:#1b7f3b; }
  @media (prefers-color-scheme: dark) { :root { --bg:#161616; --card:#1f1f1f; --text:#f1f1f1; --muted:#a9a9a9; --line:#333; --accent:#6aa7e8; --bad:#ff6b6b; --ok:#5cc483; } }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--text); font:15px/1.5 -apple-system,"Segoe UI",Roboto,Arial,sans-serif; }
  .wrap { max-width:1400px; margin:0 auto; padding:24px 16px 60px; }
  header { display:flex; flex-wrap:wrap; gap:12px; align-items:center; justify-content:space-between; margin-bottom:20px; }
  h1 { font-size:22px; margin:0; }
  .card { background:var(--card); border:1px solid var(--line); border-radius:10px; padding:16px; }
  .login { max-width:360px; margin:12vh auto; }
  input[type=password], input[type=search] { width:100%; padding:10px 12px; border:1px solid var(--line); border-radius:8px; background:var(--bg); color:var(--text); font:inherit; }
  button, .btn { display:inline-block; padding:9px 16px; border-radius:8px; border:1px solid var(--accent); background:var(--accent); color:#fff; font:inherit; cursor:pointer; text-decoration:none; white-space:nowrap; }
  .btn.ghost, button.ghost { background:transparent; color:var(--accent); }
  .tabs { display:flex; gap:8px; }
  .tabs a { padding:8px 14px; border-radius:999px; border:1px solid var(--line); color:var(--text); text-decoration:none; }
  .tabs a.on { background:var(--accent); border-color:var(--accent); color:#fff; }
  form.search { display:flex; gap:8px; flex:1; max-width:520px; }
  .meta { color:var(--muted); margin:12px 0; }
  .table { overflow-x:auto; }
  table { width:100%; border-collapse:collapse; font-size:14px; }
  th, td { text-align:left; padding:9px 10px; border-bottom:1px solid var(--line); vertical-align:top; }
  th { color:var(--muted); font-weight:600; font-size:12px; text-transform:uppercase; letter-spacing:.04em; white-space:nowrap; }
  td.message { min-width:260px; white-space:pre-wrap; }
  .status-sent { color:var(--ok); } .status-failed { color:var(--bad); font-weight:600; } .status-pending { color:var(--muted); }
  .level-info { color:var(--muted); } .level-warning { color:#b26a00; font-weight:600; } .level-error { color:var(--bad); font-weight:600; }
  .error { color:var(--bad); margin:8px 0 0; }
  .pager { display:flex; gap:8px; align-items:center; margin-top:16px; }
</style>
</head>
<body>
<div class="wrap">
<?php if (!$signedIn): ?>
  <div class="card login">
    <h1>StellAcu leads</h1>
    <?php if ($config['leads_password_hash'] === ''): ?>
      <p class="error">No password set yet (leads_password_hash in php-api/config.local.php).</p>
    <?php else: ?>
      <form method="post" action="/leads">
        <input type="hidden" name="csrf" value="<?= e($csrf) ?>">
        <p><label for="pw">Password</label><br><input id="pw" type="password" name="password" autocomplete="current-password" required autofocus></p>
        <button type="submit">Sign in</button>
        <?php if ($error !== ''): ?><p class="error"><?= e($error) ?></p><?php endif; ?>
      </form>
    <?php endif; ?>
  </div>
<?php else: ?>
  <header>
    <h1>StellAcu leads</h1>
    <div class="tabs">
      <a href="/leads" class="<?= $tab === 'leads' ? 'on' : '' ?>">Enquiries</a>
      <a href="/leads?tab=subscribers" class="<?= $tab === 'subscribers' ? 'on' : '' ?>">Newsletter</a>
      <a href="/leads?tab=activity_log" class="<?= $tab === 'activity_log' ? 'on' : '' ?>">Activity log</a>
    </div>
    <form class="search" method="get" action="/leads">
      <?php if ($tab !== 'leads'): ?><input type="hidden" name="tab" value="<?= e($tab) ?>"><?php endif; ?>
      <input type="search" name="q" value="<?= e($q) ?>" placeholder="<?= $tab === 'activity_log' ? 'Search event, level (error, warning), detail…' : 'Search name, email, company, message…' ?>">
      <button type="submit">Search</button>
    </form>
    <div>
      <a class="btn ghost" href="<?= e($link(['export' => 'csv'])) ?>">Download CSV</a>
      <form method="post" action="/leads" style="display:inline"><input type="hidden" name="csrf" value="<?= e($csrf) ?>"><button class="ghost" name="logout" value="1">Sign out</button></form>
    </div>
  </header>

  <?php if ($dbError !== ''): ?>
    <p class="error"><?= e($dbError) ?></p>
  <?php else: ?>
    <p class="meta"><?= $total ?> <?= match ($tab) { 'leads' => 'enquir' . ($total === 1 ? 'y' : 'ies'), 'subscribers' => 'signup' . ($total === 1 ? '' : 's'), default => 'log entr' . ($total === 1 ? 'y' : 'ies') . ' (kept ' . LOG_RETENTION_DAYS . ' days)' } ?><?= $q !== '' ? ' matching “' . e($q) . '”' : '' ?></p>
    <div class="card table">
      <table>
        <thead><tr><?php foreach ($columns as $label): ?><th><?= e($label) ?></th><?php endforeach; ?></tr></thead>
        <tbody>
        <?php if (!$rows): ?>
          <tr><td colspan="<?= count($columns) ?>" class="meta">Nothing here yet.</td></tr>
        <?php endif; ?>
        <?php foreach ($rows as $r): ?>
          <tr>
          <?php foreach (array_keys($columns) as $col): $v = (string) ($r[$col] ?? ''); ?>
            <?php if ($col === 'email' && $v !== ''): ?>
              <td><a href="mailto:<?= e($v) ?>"><?= e($v) ?></a></td>
            <?php elseif ($col === 'website' && $v !== ''): ?>
              <td><a href="<?= e($v) ?>" rel="noopener noreferrer" target="_blank"><?= e($v) ?></a></td>
            <?php elseif ($col === 'email_status' || $col === 'delivery_status'): ?>
              <td class="status-<?= e($v) ?>"><?= e($v) ?></td>
            <?php elseif ($col === 'level'): ?>
              <td class="level-<?= e($v) ?>"><?= e($v) ?></td>
            <?php else: ?>
              <td class="<?= $col === 'message' ? 'message' : '' ?>"><?= e($v) ?></td>
            <?php endif; ?>
          <?php endforeach; ?>
          </tr>
        <?php endforeach; ?>
        </tbody>
      </table>
    </div>
    <?php if ($pages > 1): ?>
      <div class="pager">
        <?php if ($page > 1): ?><a class="btn ghost" href="<?= e($link(['page' => $page - 1])) ?>">← Newer</a><?php endif; ?>
        <span class="meta">Page <?= $page ?> of <?= $pages ?></span>
        <?php if ($page < $pages): ?><a class="btn ghost" href="<?= e($link(['page' => $page + 1])) ?>">Older →</a><?php endif; ?>
      </div>
    <?php endif; ?>
  <?php endif; ?>
<?php endif; ?>
</div>
</body>
</html>

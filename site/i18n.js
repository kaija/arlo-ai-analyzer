/**
 * Arlo AI Analyzer website — i18n
 *
 * English lives in the markup, so a crawler or a JS-less visitor gets a complete
 * English page. This file only holds the overrides for the other locales.
 *
 * Loaded with a plain <script> and not fetch(), so the page also works when
 * index.html is opened straight off disk over file://. The switcher below is
 * the Arlo AI hub's (arlo-web/i18n.js) — keep the two in step. The shared
 * `arloLang` storage key means a language chosen on one site carries over.
 */
(function () {
  'use strict';

  var DICT = {
    'zh-Hant': {
      'meta.title': 'Arlo AI Analyzer — 看清你的 AI 寫程式花了多少 token',
      'meta.description': '本機優先的 Mac App，把 Claude Code 與 Codex CLI 的紀錄整理成 token、費用與 context 報表。免費、開源，你的 session 永遠不會離開你的 Mac。',

      'nav.features': '功能',
      'nav.privacy': '隱私',
      'nav.language': '選擇語言',
      'nav.toggle': '開關選單',

      'hero.badge': '即將登上 Mac App Store · 免費且開源',
      'hero.title': '看清你的 AI<br/>寫程式花了多少。',
      'hero.subtitle': 'Arlo AI Analyzer 讀取你 Mac 上既有的 Claude Code 與 Codex CLI 紀錄，整理成 token、費用與 context 報表 — 依 session、依模型、依日期。資料完全不離開你的電腦。',
      'hero.ctaGithub': '在 GitHub 上查看',
      'hero.ctaStore': 'Mac App Store — 敬請期待',
      'hero.tools': '支援讀取',
      'shot.dashboard': 'Arlo AI Analyzer 儀表板：API 等值金額、請求數、token 與活躍天數，下方是依模型堆疊的每日用量圖',

      'features.heading': '你的紀錄早就知道的一切',
      'features.sub': '每一次請求都寫在你的 transcript 裡。Arlo AI Analyzer 讀出來，告訴你加總起來是多少。',

      'sessions.eyebrow': 'Sessions',
      'sessions.title': '每個 session，一張表看完',
      'sessions.body': '每個 Claude Code 與 Codex CLI session 的專案、分支、時長、請求數、token 與費用 — 還有它的 context window 曾經塞到多滿。',
      'sessions.li1': '任一欄位都能排序',
      'sessions.li2': '依日期區間篩選，或用名稱搜尋',
      'sessions.li3': 'Context 最高水位一眼看出',
      'shot.sessions': 'Sessions 表格：專案、分支、開始時間、時長、請求數、token、費用、模型與 context 最高水位',

      'detail.eyebrow': 'Session 詳情',
      'detail.title': '看著 context 一路漲上去',
      'detail.body': '打開任何一個 session，逐筆看它的 context 用量，以模型的 window 為天花板，每一次 compaction 都標在發生的位置。',
      'detail.li1': '每筆請求的模型、effort、token 與費用',
      'detail.li2': '輸入、輸出、cache 寫入與 cache 讀取分開列出',
      'detail.li3': 'Stop reason，以及背後的 MCP server 或 skill',
      'shot.detail': 'Session 詳情：context 用量曲線在 compaction 時下降，下方是逐筆請求表格',

      'insights.eyebrow': 'Insights',
      'insights.title': '不只是總數，而是該改什麼',
      'insights.body': '六張卡片直指你能動手改善的花費：快要被迫 compaction 的 session、cache 吸收了多少流量，以及哪些 MCP server 和 skill 帶來最多請求。',
      'insights.li1': '哪些請求換成較小的模型也能勝任',
      'insights.li2': '對照預算的消耗速度與月底預估',
      'insights.li3': '在 max_tokens 被截斷或遭拒絕的回應',
      'shot.insights': 'Insights 卡片：context 健康度、cache 效率、MCP 與 skill 歸屬、模型降級建議、預算與預估、工具失敗',

      'settings.eyebrow': '方案與提醒',
      'settings.title': '你的方案、你的預算、你的提醒',
      'settings.body': '告訴它你付多少、打算花多少。它會算出你的用量以 API 計價值多少，並在 session 快用完 context、或當月預算快見底之前提醒你。',
      'settings.li1': 'API 等值金額 vs. 你的月費方案',
      'settings.li2': '自訂門檻的 context 提醒',
      'settings.li3': '預算達 80% 與 100% 時警示',
      'shot.settings': '設定：月費方案價格、每月預算、context 提醒門檻、通知與紀錄資料夾',

      'why.heading': '安靜地待在一旁',
      'why.sub': '不用 proxy、不用 API 金鑰，除了選個資料夾之外什麼都不用設定。',
      'why.logs.title': '讀你本來就有的紀錄',
      'why.logs.body': 'Claude Code 與 Codex CLI 早就把每一次請求寫進硬碟。把 Arlo AI Analyzer 指向那些資料夾，新的 session 一出現它就會跟上。',
      'why.pricing.title': '逐個模型計價',
      'why.pricing.body': '內建 Claude 的價格；其他模型來自每日更新的公開價格表，自架的模型也能自己填價格。查不到價格的模型顯示「—」，絕不當成 $0。',
      'why.tray.title': '常駐在選單列',
      'why.tray.body': '關掉視窗後它仍待在選單列，點一下就看得到今天花了多少，超過你設定的每日上限時也會提醒你。',

      'privacy.heading': '你的 session 永遠不會離開你的 Mac',
      'privacy.sub': '本機優先是設計本身，不是某個要你去找的設定。',
      'privacy.account.title': '不需要帳號',
      'privacy.account.body': '沒有東西要註冊，也沒有東西要登入。',
      'privacy.telemetry.title': '沒有遙測',
      'privacy.telemetry.body': 'App 內沒有分析、沒有廣告、沒有追蹤。',
      'privacy.readonly.title': '唯讀，只碰你選的資料夾',
      'privacy.readonly.body': '運行在沙盒中，只開啟你親自選擇的紀錄資料夾，而且從不寫入。',
      'privacy.network.title': '每天最多一次，可以關掉',
      'privacy.network.body': '下載公開的模型價格表 — 每個人拿到的都是同一個檔案。可在設定中關閉。',
      'privacy.link': '閱讀隱私權政策 →',

      'footer.privacy': '隱私權',
      'footer.support': '支援',
      'footer.license': '授權條款',
      'footer.catalog': '模型價格 (JSON)',
      'footer.note': '模型價格每日轉載自 OpenRouter 公開的模型清單。'
    },

    ja: {
      'meta.title': 'Arlo AI Analyzer — AI コーディングのトークンの行き先を見える化',
      'meta.description': 'Claude Code と Codex CLI のログから、トークン・コスト・コンテキストのレポートを作るローカル優先の Mac アプリ。無料・オープンソース。セッションが Mac の外に出ることはありません。',

      'nav.features': '機能',
      'nav.privacy': 'プライバシー',
      'nav.language': '言語を選択',
      'nav.toggle': 'メニューを開閉',

      'hero.badge': 'Mac App Store に近日登場 · 無料・オープンソース',
      'hero.title': 'AI コーディングの<br/>トークン、どこへ消えた？',
      'hero.subtitle': 'Arlo AI Analyzer は、Mac にすでにある Claude Code と Codex CLI のログを読み込み、トークン・コスト・コンテキストのレポートにまとめます。セッション別、モデル別、日別に。データはマシンの外に出ません。',
      'hero.ctaGithub': 'GitHub で見る',
      'hero.ctaStore': 'Mac App Store — 近日公開',
      'hero.tools': '対応ログ',
      'shot.dashboard': 'Arlo AI Analyzer のダッシュボード：API 換算額、リクエスト数、トークン、稼働日数と、モデル別に積み上げた日別使用量グラフ',

      'features.heading': 'ログはすでに全部知っている',
      'features.sub': 'すべてのリクエストはトランスクリプトに記録されています。Arlo AI Analyzer はそれを読み、合計でどうなるかを見せます。',

      'sessions.eyebrow': 'セッション',
      'sessions.title': 'すべてのセッションを 1 つの表に',
      'sessions.body': 'Claude Code と Codex CLI のセッションごとに、プロジェクト、ブランチ、所要時間、リクエスト数、トークン、コスト — そしてコンテキストウィンドウがどこまで埋まったか。',
      'sessions.li1': 'どの列でも並べ替え',
      'sessions.li2': '期間で絞り込み、名前で検索',
      'sessions.li3': 'コンテキストの最高水位がひと目で',
      'shot.sessions': 'セッション一覧：プロジェクト、ブランチ、開始時刻、所要時間、リクエスト数、トークン、コスト、モデル、コンテキスト最高水位',

      'detail.eyebrow': 'セッション詳細',
      'detail.title': 'コンテキストが埋まっていく様子を追う',
      'detail.body': 'セッションを開くと、モデルのウィンドウを上限線として、リクエストごとのコンテキスト使用量を表示。コンパクションは起きた位置に印が付きます。',
      'detail.li1': 'リクエストごとのモデル、effort、トークン、コスト',
      'detail.li2': '入力・出力・キャッシュ書き込み・キャッシュ読み込みを分けて表示',
      'detail.li3': 'Stop reason と、その背後の MCP サーバーやスキル',
      'shot.detail': 'セッション詳細：コンパクションで下がるコンテキスト使用量のグラフと、リクエストごとの表',

      'insights.eyebrow': 'インサイト',
      'insights.title': '合計だけでなく、何を変えるべきか',
      'insights.body': '手を打てる支出を指し示す 6 枚のカード。強制コンパクション間近のセッション、キャッシュが吸収しているトラフィックの割合、リクエストを最も生んでいる MCP サーバーとスキル。',
      'insights.li1': 'より小さいモデルで足りたリクエスト',
      'insights.li2': '予算に対する消化ペースと月末見込み',
      'insights.li3': 'max_tokens で打ち切られた、または拒否された応答',
      'shot.insights': 'インサイトのカード：コンテキストの健全性、キャッシュ効率、MCP とスキルの内訳、モデルの適正化、予算と予測、ツールの失敗',

      'settings.eyebrow': 'プランとアラート',
      'settings.title': 'あなたのプラン、予算、アラート',
      'settings.body': '支払っている額と使うつもりの額を入力すると、使用量を API 料金で換算した額を示し、セッションのコンテキストや月の予算が尽きる前に知らせます。',
      'settings.li1': '月額プランに対する API 換算額',
      'settings.li2': '好きなしきい値でコンテキストアラート',
      'settings.li3': '予算の 80% と 100% で警告',
      'shot.settings': '設定：月額プラン料金、月間予算、コンテキストアラートのしきい値、通知、ログフォルダ',

      'why.heading': '邪魔にならないように作りました',
      'why.sub': 'プロキシも API キーも不要。フォルダを選ぶ以外の設定はありません。',
      'why.logs.title': '手元のログをそのまま読む',
      'why.logs.body': 'Claude Code と Codex CLI は、すでにすべてのリクエストをディスクに書き出しています。そのフォルダを指定すれば、新しいセッションにも自動で追従します。',
      'why.pricing.title': 'モデルごとに価格を計算',
      'why.pricing.body': 'Claude の料金は内蔵。ほかのモデルは毎日更新される公開価格表から取得し、セルフホストのモデルには自分で価格を設定できます。価格が分からないモデルは「—」と表示し、決して $0 にはしません。',
      'why.tray.title': 'メニューバーに常駐',
      'why.tray.body': 'ウィンドウを閉じてもメニューバーに残り、今日の支出はクリック 1 つで確認できます。設定した 1 日の上限を超えると通知します。',

      'privacy.heading': 'セッションが Mac の外に出ることはありません',
      'privacy.sub': 'ローカル優先は設計そのもの。探して見つける設定項目ではありません。',
      'privacy.account.title': 'アカウント不要',
      'privacy.account.body': '登録もサインインもありません。',
      'privacy.telemetry.title': 'テレメトリなし',
      'privacy.telemetry.body': 'アプリ内に分析も広告もトラッキングもありません。',
      'privacy.readonly.title': '読み取り専用、選んだフォルダだけ',
      'privacy.readonly.body': 'サンドボックスで動作し、あなたが選んだログフォルダだけを開きます。書き込みはしません。',
      'privacy.network.title': '通信は 1 日 1 回、オフにも可能',
      'privacy.network.body': '公開のモデル価格表 — 全員が同じファイルを受け取ります。設定でオフにできます。',
      'privacy.link': 'プライバシーポリシーを読む →',

      'footer.privacy': 'プライバシー',
      'footer.support': 'サポート',
      'footer.license': 'ライセンス',
      'footer.catalog': 'モデル価格 (JSON)',
      'footer.note': 'モデル価格は OpenRouter の公開モデル一覧から毎日転載しています。'
    }
  };

  var STORAGE_KEY = 'arloLang';
  var nodes = document.querySelectorAll('[data-i18n]');
  var attrNodes = document.querySelectorAll('[data-i18n-attr]');

  // Snapshot the English markup so switching back to EN restores it exactly
  // (including the <br/> in the hero headline).
  var EN = {};
  nodes.forEach(function (el) {
    EN[el.dataset.i18n] = el.innerHTML;
  });
  var EN_ATTR = [];
  attrNodes.forEach(function (el) {
    var parts = el.dataset.i18nAttr.split(':');
    EN_ATTR.push({ el: el, attr: parts[0], key: parts[1], value: el.getAttribute(parts[0]) });
  });

  function apply(lang) {
    var dict = DICT[lang];
    document.documentElement.lang = lang;

    nodes.forEach(function (el) {
      var key = el.dataset.i18n;
      // Values are authored in this file, never user input — markup is intentional.
      el.innerHTML = dict && dict[key] ? dict[key] : EN[key];
    });

    EN_ATTR.forEach(function (item) {
      var value = dict && dict[item.key] ? dict[item.key] : item.value;
      item.el.setAttribute(item.attr, value);
      if (item.el.tagName === 'TITLE') {
        document.title = value;
      }
    });

    document.querySelectorAll('.lang-switch button').forEach(function (btn) {
      btn.setAttribute('aria-current', String(btn.dataset.lang === lang));
    });
  }

  function store(lang) {
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch (e) {
      /* private mode — the choice just won't persist */
    }
  }

  function initial() {
    var param = new URLSearchParams(location.search).get('lang');
    if (param && (param === 'en' || DICT[param])) return param;
    try {
      var saved = localStorage.getItem(STORAGE_KEY);
      if (saved && (saved === 'en' || DICT[saved])) return saved;
    } catch (e) {
      /* ignore */
    }
    // No navigator.language sniffing — a silent language switch on first load is
    // more surprising than helpful, and the switcher is right there in the nav.
    return 'en';
  }

  document.querySelectorAll('.lang-switch button').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var lang = btn.dataset.lang;
      apply(lang);
      store(lang);
    });
  });

  apply(initial());
})();

/* @ds-bundle: {"format":4,"namespace":"DocketDesignSystem_e2ed17","components":[{"name":"Avatar","sourcePath":"components/core/Avatar.jsx"},{"name":"Badge","sourcePath":"components/core/Badge.jsx"},{"name":"Button","sourcePath":"components/core/Button.jsx"},{"name":"Icon","sourcePath":"components/core/Icon.jsx"},{"name":"IconButton","sourcePath":"components/core/IconButton.jsx"},{"name":"Kbd","sourcePath":"components/core/Kbd.jsx"},{"name":"Tag","sourcePath":"components/core/Tag.jsx"},{"name":"ICONS","sourcePath":"components/core/iconData.js"},{"name":"SegmentedTabs","sourcePath":"components/forms/SegmentedTabs.jsx"},{"name":"TextInput","sourcePath":"components/forms/TextInput.jsx"},{"name":"BoardColumn","sourcePath":"components/issues/BoardColumn.jsx"},{"name":"IssueRow","sourcePath":"components/issues/IssueRow.jsx"},{"name":"KanbanCard","sourcePath":"components/issues/KanbanCard.jsx"},{"name":"PRIORITY","sourcePath":"components/issues/PriorityIcon.jsx"},{"name":"PriorityIcon","sourcePath":"components/issues/PriorityIcon.jsx"},{"name":"STATUS","sourcePath":"components/issues/StatusIcon.jsx"},{"name":"StatusIcon","sourcePath":"components/issues/StatusIcon.jsx"},{"name":"Footer","sourcePath":"components/navigation/Footer.jsx"},{"name":"SidebarItem","sourcePath":"components/navigation/SidebarItem.jsx"},{"name":"TopNav","sourcePath":"components/navigation/TopNav.jsx"},{"name":"Card","sourcePath":"components/surfaces/Card.jsx"},{"name":"ChangelogRow","sourcePath":"components/surfaces/ChangelogRow.jsx"},{"name":"Menu","sourcePath":"components/surfaces/Menu.jsx"}],"sourceHashes":{"components/core/Avatar.jsx":"37c2d98c2284","components/core/Badge.jsx":"115fcd5340a6","components/core/Button.jsx":"0284b4f925d0","components/core/Icon.jsx":"aa13bcfb7ab6","components/core/IconButton.jsx":"bda755fdf166","components/core/Kbd.jsx":"8864acd4aa9c","components/core/Tag.jsx":"a2f4227773c1","components/core/iconData.js":"ec8905d94d75","components/forms/SegmentedTabs.jsx":"828c594edb9d","components/forms/TextInput.jsx":"8462b77e4ef9","components/issues/BoardColumn.jsx":"266e0bffaa55","components/issues/IssueRow.jsx":"0ae395889d28","components/issues/KanbanCard.jsx":"536a76525895","components/issues/PriorityIcon.jsx":"6731cb8abad3","components/issues/StatusIcon.jsx":"96d0864f2227","components/navigation/Footer.jsx":"9da1c1346cd3","components/navigation/SidebarItem.jsx":"eb1df16fee0b","components/navigation/TopNav.jsx":"fab56c12a370","components/surfaces/Card.jsx":"49cf5077d313","components/surfaces/ChangelogRow.jsx":"0f32fc6ed0fd","components/surfaces/Menu.jsx":"23f8b00febc7","ui_kits/app/Board.jsx":"ed5f37a94830","ui_kits/app/CreateIssue.jsx":"d16bdc1b73c8","ui_kits/app/IssueDetail.jsx":"70a463526550","ui_kits/app/IssueList.jsx":"4c3168e5e14b","ui_kits/app/Sidebar.jsx":"6045458abfc4","ui_kits/app/data.js":"189b02654cd2","ui_kits/website/Home.jsx":"cad76149119e","ui_kits/website/Pages.jsx":"50032d4fdf74"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.DocketDesignSystem_e2ed17 = window.DocketDesignSystem_e2ed17 || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// components/core/Avatar.jsx
try { (() => {
const PAL = ['#C97253', '#BC804E', '#8FA27A', '#8597B0', '#A88497', '#D6A94A'];
function Avatar({
  name = '',
  src,
  size = 20,
  style
}) {
  const initials = name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase();
  const c = PAL[[...name].reduce((a, ch) => a + ch.charCodeAt(0), 0) % PAL.length];
  return /*#__PURE__*/React.createElement("span", {
    title: name,
    style: {
      width: size,
      height: size,
      flex: 'none',
      borderRadius: 9999,
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: src ? 'var(--surface-3)' : c,
      color: '#170E0A',
      fontFamily: 'var(--font-text)',
      fontSize: Math.round(size * 0.42),
      fontWeight: 600,
      overflow: 'hidden',
      ...style
    }
  }, src ? /*#__PURE__*/React.createElement("img", {
    src: src,
    alt: name,
    style: {
      width: '100%',
      height: '100%',
      objectFit: 'cover'
    }
  }) : initials);
}
Object.assign(__ds_scope, { Avatar });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Avatar.jsx", error: String((e && e.message) || e) }); }

// components/core/Badge.jsx
try { (() => {
const T = {
  neutral: ['var(--surface-2)', 'var(--ink-muted)', 'var(--ink-subtle)'],
  success: ['var(--success-tint)', 'var(--success)', 'var(--success)'],
  primary: ['var(--primary-tint)', 'var(--primary-hover)', 'var(--primary)'],
  warning: ['rgba(214,169,74,.14)', 'var(--warning)', 'var(--warning)']
};
function Badge({
  tone = 'neutral',
  dot,
  children,
  style
}) {
  const [bg, fg, d] = T[tone] || T.neutral;
  return /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      padding: '2px 8px',
      borderRadius: 'var(--radius-pill)',
      background: bg,
      color: fg,
      fontFamily: 'var(--font-text)',
      fontSize: 12,
      lineHeight: 1.4,
      fontWeight: 500,
      whiteSpace: 'nowrap',
      ...style
    }
  }, dot && /*#__PURE__*/React.createElement("span", {
    style: {
      width: 6,
      height: 6,
      borderRadius: 9999,
      background: d
    }
  }), children);
}
Object.assign(__ds_scope, { Badge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Badge.jsx", error: String((e && e.message) || e) }); }

// components/core/Kbd.jsx
try { (() => {
function Kbd({
  children,
  style
}) {
  return /*#__PURE__*/React.createElement("kbd", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      minWidth: 18,
      height: 18,
      padding: '0 4px',
      borderRadius: 'var(--radius-xs)',
      border: '1px solid var(--hairline-strong)',
      background: 'var(--surface-2)',
      color: 'var(--ink-subtle)',
      fontFamily: 'var(--font-mono)',
      fontSize: 11,
      lineHeight: 1,
      ...style
    }
  }, children);
}
Object.assign(__ds_scope, { Kbd });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Kbd.jsx", error: String((e && e.message) || e) }); }

// components/core/Tag.jsx
try { (() => {
function Tag({
  color,
  children,
  onRemove,
  style
}) {
  return /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      height: 22,
      padding: '0 8px',
      borderRadius: 'var(--radius-sm)',
      border: '1px solid var(--hairline-strong)',
      background: 'transparent',
      color: 'var(--ink-muted)',
      fontFamily: 'var(--font-text)',
      fontSize: 12,
      fontWeight: 500,
      whiteSpace: 'nowrap',
      ...style
    }
  }, color && /*#__PURE__*/React.createElement("span", {
    style: {
      width: 8,
      height: 8,
      borderRadius: 9999,
      background: color,
      flex: 'none'
    }
  }), children, onRemove && /*#__PURE__*/React.createElement("span", {
    onClick: onRemove,
    style: {
      cursor: 'pointer',
      color: 'var(--ink-subtle)',
      marginLeft: 2
    }
  }, "\xD7"));
}
Object.assign(__ds_scope, { Tag });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Tag.jsx", error: String((e && e.message) || e) }); }

// components/core/iconData.js
try { (() => {
// Lucide v0.460.0 (ISC) inner SVG markup, copied programmatically from lucide-static
const ICONS = {
  "sun": "<circle cx=\"12\" cy=\"12\" r=\"4\" /> <path d=\"M12 2v2\" /> <path d=\"M12 20v2\" /> <path d=\"m4.93 4.93 1.41 1.41\" /> <path d=\"m17.66 17.66 1.41 1.41\" /> <path d=\"M2 12h2\" /> <path d=\"M20 12h2\" /> <path d=\"m6.34 17.66-1.41 1.41\" /> <path d=\"m19.07 4.93-1.41 1.41\" />",
  "moon": "<path d=\"M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z\" />",
  "circle-dashed": "<path d=\"M10.1 2.182a10 10 0 0 1 3.8 0\" /> <path d=\"M13.9 21.818a10 10 0 0 1-3.8 0\" /> <path d=\"M17.609 3.721a10 10 0 0 1 2.69 2.7\" /> <path d=\"M2.182 13.9a10 10 0 0 1 0-3.8\" /> <path d=\"M20.279 17.609a10 10 0 0 1-2.7 2.69\" /> <path d=\"M21.818 10.1a10 10 0 0 1 0 3.8\" /> <path d=\"M3.721 6.391a10 10 0 0 1 2.7-2.69\" /> <path d=\"M6.391 20.279a10 10 0 0 1-2.69-2.7\" />",
  "circle": "<circle cx=\"12\" cy=\"12\" r=\"10\" />",
  "circle-dot": "<circle cx=\"12\" cy=\"12\" r=\"10\" /> <circle cx=\"12\" cy=\"12\" r=\"1\" />",
  "circle-check": "<circle cx=\"12\" cy=\"12\" r=\"10\" /> <path d=\"m9 12 2 2 4-4\" />",
  "circle-x": "<circle cx=\"12\" cy=\"12\" r=\"10\" /> <path d=\"m15 9-6 6\" /> <path d=\"m9 9 6 6\" />",
  "circle-alert": "<circle cx=\"12\" cy=\"12\" r=\"10\" /> <line x1=\"12\" x2=\"12\" y1=\"8\" y2=\"12\" /> <line x1=\"12\" x2=\"12.01\" y1=\"16\" y2=\"16\" />",
  "signal-low": "<path d=\"M2 20h.01\" /> <path d=\"M7 20v-4\" />",
  "signal-medium": "<path d=\"M2 20h.01\" /> <path d=\"M7 20v-4\" /> <path d=\"M12 20v-8\" />",
  "signal-high": "<path d=\"M2 20h.01\" /> <path d=\"M7 20v-4\" /> <path d=\"M12 20v-8\" /> <path d=\"M17 20V8\" />",
  "ellipsis": "<circle cx=\"12\" cy=\"12\" r=\"1\" /> <circle cx=\"19\" cy=\"12\" r=\"1\" /> <circle cx=\"5\" cy=\"12\" r=\"1\" />",
  "inbox": "<polyline points=\"22 12 16 12 14 15 10 15 8 12 2 12\" /> <path d=\"M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z\" />",
  "layers": "<path d=\"m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z\" /> <path d=\"m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65\" /> <path d=\"m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65\" />",
  "square-kanban": "<rect width=\"18\" height=\"18\" x=\"3\" y=\"3\" rx=\"2\" /> <path d=\"M8 7v7\" /> <path d=\"M12 7v4\" /> <path d=\"M16 7v9\" />",
  "list": "<path d=\"M3 12h.01\" /> <path d=\"M3 18h.01\" /> <path d=\"M3 6h.01\" /> <path d=\"M8 12h13\" /> <path d=\"M8 18h13\" /> <path d=\"M8 6h13\" />",
  "search": "<circle cx=\"11\" cy=\"11\" r=\"8\" /> <path d=\"m21 21-4.3-4.3\" />",
  "plus": "<path d=\"M5 12h14\" /> <path d=\"M12 5v14\" />",
  "square-pen": "<path d=\"M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7\" /> <path d=\"M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z\" />",
  "settings": "<path d=\"M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z\" /> <circle cx=\"12\" cy=\"12\" r=\"3\" />",
  "chevron-down": "<path d=\"m6 9 6 6 6-6\" />",
  "chevron-right": "<path d=\"m9 18 6-6-6-6\" />",
  "chevron-left": "<path d=\"m15 18-6-6 6-6\" />",
  "user": "<path d=\"M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2\" /> <circle cx=\"12\" cy=\"7\" r=\"4\" />",
  "users": "<path d=\"M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2\" /> <circle cx=\"9\" cy=\"7\" r=\"4\" /> <path d=\"M22 21v-2a4 4 0 0 0-3-3.87\" /> <path d=\"M16 3.13a4 4 0 0 1 0 7.75\" />",
  "calendar": "<path d=\"M8 2v4\" /> <path d=\"M16 2v4\" /> <rect width=\"18\" height=\"18\" x=\"3\" y=\"4\" rx=\"2\" /> <path d=\"M3 10h18\" />",
  "tag": "<path d=\"M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z\" /> <circle cx=\"7.5\" cy=\"7.5\" r=\".5\" fill=\"currentColor\" />",
  "list-filter": "<path d=\"M3 6h18\" /> <path d=\"M7 12h10\" /> <path d=\"M10 18h4\" />",
  "sliders-horizontal": "<line x1=\"21\" x2=\"14\" y1=\"4\" y2=\"4\" /> <line x1=\"10\" x2=\"3\" y1=\"4\" y2=\"4\" /> <line x1=\"21\" x2=\"12\" y1=\"12\" y2=\"12\" /> <line x1=\"8\" x2=\"3\" y1=\"12\" y2=\"12\" /> <line x1=\"21\" x2=\"16\" y1=\"20\" y2=\"20\" /> <line x1=\"12\" x2=\"3\" y1=\"20\" y2=\"20\" /> <line x1=\"14\" x2=\"14\" y1=\"2\" y2=\"6\" /> <line x1=\"8\" x2=\"8\" y1=\"10\" y2=\"14\" /> <line x1=\"16\" x2=\"16\" y1=\"18\" y2=\"22\" />",
  "bell": "<path d=\"M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9\" /> <path d=\"M10.3 21a1.94 1.94 0 0 0 3.4 0\" />",
  "message-square": "<path d=\"M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z\" />",
  "paperclip": "<path d=\"m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48\" />",
  "x": "<path d=\"M18 6 6 18\" /> <path d=\"m6 6 12 12\" />",
  "check": "<path d=\"M20 6 9 17l-5-5\" />",
  "arrow-up-right": "<path d=\"M7 7h10v10\" /> <path d=\"M7 17 17 7\" />",
  "arrow-right": "<path d=\"M5 12h14\" /> <path d=\"m12 5 7 7-7 7\" />",
  "hash": "<line x1=\"4\" x2=\"20\" y1=\"9\" y2=\"9\" /> <line x1=\"4\" x2=\"20\" y1=\"15\" y2=\"15\" /> <line x1=\"10\" x2=\"8\" y1=\"3\" y2=\"21\" /> <line x1=\"16\" x2=\"14\" y1=\"3\" y2=\"21\" />",
  "folder": "<path d=\"M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z\" />",
  "target": "<circle cx=\"12\" cy=\"12\" r=\"10\" /> <circle cx=\"12\" cy=\"12\" r=\"6\" /> <circle cx=\"12\" cy=\"12\" r=\"2\" />",
  "git-branch": "<line x1=\"6\" x2=\"6\" y1=\"3\" y2=\"15\" /> <circle cx=\"18\" cy=\"6\" r=\"3\" /> <circle cx=\"6\" cy=\"18\" r=\"3\" /> <path d=\"M18 9a9 9 0 0 1-9 9\" />",
  "link": "<path d=\"M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71\" /> <path d=\"M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71\" />",
  "star": "<path d=\"M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z\" />",
  "archive": "<rect width=\"20\" height=\"5\" x=\"2\" y=\"3\" rx=\"1\" /> <path d=\"M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8\" /> <path d=\"M10 12h4\" />",
  "clock": "<circle cx=\"12\" cy=\"12\" r=\"10\" /> <polyline points=\"12 6 12 12 16 14\" />",
  "zap": "<path d=\"M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z\" />",
  "panel-left": "<rect width=\"18\" height=\"18\" x=\"3\" y=\"3\" rx=\"2\" /> <path d=\"M9 3v18\" />",
  "circle-user": "<circle cx=\"12\" cy=\"12\" r=\"10\" /> <circle cx=\"12\" cy=\"10\" r=\"3\" /> <path d=\"M7 20.662V19a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v1.662\" />",
  "at-sign": "<circle cx=\"12\" cy=\"12\" r=\"4\" /> <path d=\"M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8\" />",
  "copy": "<rect width=\"14\" height=\"14\" x=\"8\" y=\"8\" rx=\"2\" ry=\"2\" /> <path d=\"M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2\" />",
  "trash-2": "<path d=\"M3 6h18\" /> <path d=\"M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6\" /> <path d=\"M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2\" /> <line x1=\"10\" x2=\"10\" y1=\"11\" y2=\"17\" /> <line x1=\"14\" x2=\"14\" y1=\"11\" y2=\"17\" />",
  "eye": "<path d=\"M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0\" /> <circle cx=\"12\" cy=\"12\" r=\"3\" />",
  "command": "<path d=\"M15 6v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3\" />",
  "box": "<path d=\"M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z\" /> <path d=\"m3.3 7 8.7 5 8.7-5\" /> <path d=\"M12 22V12\" />",
  "map": "<path d=\"M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0z\" /> <path d=\"M15 5.764v15\" /> <path d=\"M9 3.236v15\" />",
  "git-pull-request": "<circle cx=\"18\" cy=\"18\" r=\"3\" /> <circle cx=\"6\" cy=\"6\" r=\"3\" /> <path d=\"M13 6h3a2 2 0 0 1 2 2v7\" /> <line x1=\"6\" x2=\"6\" y1=\"9\" y2=\"21\" />",
  "send": "<path d=\"M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z\" /> <path d=\"m21.854 2.147-10.94 10.939\" />",
  "sparkles": "<path d=\"M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z\" /> <path d=\"M20 3v4\" /> <path d=\"M22 5h-4\" /> <path d=\"M4 17v2\" /> <path d=\"M5 18H3\" />",
  "lock": "<rect width=\"18\" height=\"11\" x=\"3\" y=\"11\" rx=\"2\" ry=\"2\" /> <path d=\"M7 11V7a5 5 0 0 1 10 0v4\" />",
  "shield": "<path d=\"M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z\" />"
};
Object.assign(__ds_scope, { ICONS });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/iconData.js", error: String((e && e.message) || e) }); }

// components/core/Icon.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function Icon({
  name,
  size = 16,
  strokeWidth = 1.75,
  color = 'currentColor',
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("svg", _extends({
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: color,
    strokeWidth: strokeWidth,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": "true",
    style: {
      flex: 'none',
      display: 'block',
      ...style
    },
    dangerouslySetInnerHTML: {
      __html: __ds_scope.ICONS[name] || ''
    }
  }, rest));
}
Object.assign(__ds_scope, { Icon });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Icon.jsx", error: String((e && e.message) || e) }); }

// components/core/Button.jsx
try { (() => {
const V = {
  primary: {
    bg: 'var(--primary)',
    hover: 'var(--primary-hover)',
    active: 'var(--primary-pressed)',
    fg: 'var(--on-primary)',
    border: 'transparent'
  },
  secondary: {
    bg: 'var(--surface-1)',
    hover: 'var(--surface-2)',
    active: 'var(--surface-3)',
    fg: 'var(--ink)',
    border: 'var(--hairline)',
    hoverBorder: 'var(--hairline-strong)'
  },
  tertiary: {
    bg: 'transparent',
    hover: 'var(--bg-hover)',
    active: 'var(--bg-selected)',
    fg: 'var(--ink)',
    border: 'transparent'
  },
  inverse: {
    bg: 'var(--inverse-canvas)',
    hover: 'var(--inverse-surface-1)',
    active: 'var(--inverse-surface-2)',
    fg: 'var(--inverse-ink)',
    border: 'transparent'
  }
};
const S = {
  sm: {
    h: 28,
    pad: '0 10px',
    fs: 12,
    icon: 14
  },
  md: {
    h: 36,
    pad: '8px 14px',
    fs: 14,
    icon: 16
  },
  lg: {
    h: 44,
    pad: '10px 18px',
    fs: 15,
    icon: 16
  }
};
function Button({
  variant = 'primary',
  size = 'md',
  icon,
  iconRight,
  disabled,
  fullWidth,
  children,
  onClick,
  type = 'button',
  style
}) {
  const [h, setH] = React.useState(false);
  const [a, setA] = React.useState(false);
  const v = V[variant] || V.primary;
  const s = S[size] || S.md;
  return /*#__PURE__*/React.createElement("button", {
    type: type,
    disabled: disabled,
    onClick: onClick,
    onMouseEnter: () => setH(true),
    onMouseLeave: () => {
      setH(false);
      setA(false);
    },
    onMouseDown: () => setA(true),
    onMouseUp: () => setA(false),
    style: {
      display: fullWidth ? 'flex' : 'inline-flex',
      width: fullWidth ? '100%' : undefined,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      height: s.h,
      padding: s.pad,
      borderRadius: 'var(--radius-md)',
      border: '1px solid ' + (h && v.hoverBorder && !disabled ? v.hoverBorder : v.border),
      background: disabled ? v.bg : a ? v.active : h ? v.hover : v.bg,
      color: v.fg,
      fontFamily: 'var(--font-text)',
      fontSize: s.fs,
      fontWeight: 500,
      lineHeight: 1.2,
      letterSpacing: 0,
      whiteSpace: 'nowrap',
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.45 : 1,
      transition: 'background var(--dur-fast), border-color var(--dur-fast)',
      ...style
    }
  }, icon && /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: icon,
    size: s.icon
  }), children, iconRight && /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: iconRight,
    size: s.icon
  }));
}
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Button.jsx", error: String((e && e.message) || e) }); }

// components/core/IconButton.jsx
try { (() => {
const S = {
  sm: [24, 14],
  md: [28, 16],
  lg: [32, 18]
};
function IconButton({
  icon,
  size = 'md',
  variant = 'ghost',
  active,
  label,
  onClick,
  disabled,
  style
}) {
  const [h, setH] = React.useState(false);
  const [d, i] = S[size] || S.md;
  const outline = variant === 'secondary';
  return /*#__PURE__*/React.createElement("button", {
    type: "button",
    "aria-label": label,
    title: label,
    disabled: disabled,
    onClick: onClick,
    onMouseEnter: () => setH(true),
    onMouseLeave: () => setH(false),
    style: {
      width: d,
      height: d,
      flex: 'none',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 0,
      borderRadius: 'var(--radius-sm)',
      border: '1px solid ' + (outline ? h ? 'var(--hairline-strong)' : 'var(--hairline)' : 'transparent'),
      background: active ? 'var(--bg-selected)' : h && !disabled ? outline ? 'var(--surface-2)' : 'var(--bg-hover)' : outline ? 'var(--surface-1)' : 'transparent',
      color: active || h ? 'var(--ink)' : 'var(--ink-subtle)',
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.45 : 1,
      transition: 'background var(--dur-fast), color var(--dur-fast)',
      ...style
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: icon,
    size: i
  }));
}
Object.assign(__ds_scope, { IconButton });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/IconButton.jsx", error: String((e && e.message) || e) }); }

// components/forms/SegmentedTabs.jsx
try { (() => {
function SegmentedTabs({
  options = [],
  value,
  onChange,
  style
}) {
  return /*#__PURE__*/React.createElement("div", {
    role: "tablist",
    style: {
      display: 'inline-flex',
      gap: 2,
      padding: 3,
      borderRadius: 'var(--radius-pill)',
      border: '1px solid var(--hairline)',
      background: 'var(--canvas)',
      ...style
    }
  }, options.map(o => {
    const val = typeof o === 'string' ? o : o.value;
    const lab = typeof o === 'string' ? o : o.label;
    const sel = val === value;
    return /*#__PURE__*/React.createElement("button", {
      key: val,
      role: "tab",
      "aria-selected": sel,
      onClick: () => onChange && onChange(val),
      style: {
        padding: '6px 14px',
        borderRadius: 'var(--radius-pill)',
        border: 0,
        background: sel ? 'var(--surface-2)' : 'transparent',
        color: sel ? 'var(--ink)' : 'var(--ink-subtle)',
        boxShadow: sel ? 'inset 0 0 0 1px var(--hairline-strong)' : 'none',
        fontFamily: 'var(--font-text)',
        fontSize: 14,
        fontWeight: 500,
        lineHeight: 1.2,
        cursor: 'pointer',
        transition: 'background var(--dur-fast), color var(--dur-fast)'
      }
    }, lab);
  }));
}
Object.assign(__ds_scope, { SegmentedTabs });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/SegmentedTabs.jsx", error: String((e && e.message) || e) }); }

// components/forms/TextInput.jsx
try { (() => {
function TextInput({
  label,
  placeholder,
  value,
  defaultValue,
  onChange,
  icon,
  size = 'md',
  type = 'text',
  disabled,
  style
}) {
  const [f, setF] = React.useState(false);
  const h = size === 'sm' ? 28 : 36;
  return /*#__PURE__*/React.createElement("label", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
      ...style
    }
  }, label && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      fontWeight: 500,
      color: 'var(--ink-muted)'
    }
  }, label), /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      height: h,
      padding: size === 'sm' ? '0 10px' : '8px 12px',
      borderRadius: 'var(--radius-md)',
      background: 'var(--surface-1)',
      border: '1px solid ' + (f ? 'var(--hairline-tertiary)' : 'var(--hairline)'),
      boxShadow: f ? 'var(--focus-ring)' : 'none',
      color: 'var(--ink-subtle)',
      opacity: disabled ? 0.5 : 1,
      transition: 'box-shadow var(--dur-fast), border-color var(--dur-fast)'
    }
  }, icon && /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: icon,
    size: 14
  }), /*#__PURE__*/React.createElement("input", {
    type: type,
    placeholder: placeholder,
    value: value,
    defaultValue: defaultValue,
    onChange: onChange,
    disabled: disabled,
    onFocus: () => setF(true),
    onBlur: () => setF(false),
    style: {
      flex: 1,
      minWidth: 0,
      border: 0,
      outline: 0,
      background: 'transparent',
      color: 'var(--ink)',
      fontFamily: 'var(--font-text)',
      fontSize: size === 'sm' ? 13 : 14,
      letterSpacing: 0
    }
  })));
}
Object.assign(__ds_scope, { TextInput });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/TextInput.jsx", error: String((e && e.message) || e) }); }

// components/issues/PriorityIcon.jsx
try { (() => {
const PRIORITY = {
  none: {
    icon: 'ellipsis',
    label: 'No priority',
    color: 'var(--ink-tertiary)'
  },
  urgent: {
    icon: 'circle-alert',
    label: 'Urgent',
    color: 'var(--primary)'
  },
  high: {
    icon: 'signal-high',
    label: 'High',
    color: 'var(--ink-muted)'
  },
  medium: {
    icon: 'signal-medium',
    label: 'Medium',
    color: 'var(--ink-muted)'
  },
  low: {
    icon: 'signal-low',
    label: 'Low',
    color: 'var(--ink-muted)'
  }
};
function PriorityIcon({
  priority = 'none',
  size = 14
}) {
  const p = PRIORITY[priority] || PRIORITY.none;
  return /*#__PURE__*/React.createElement("span", {
    title: p.label,
    style: {
      display: 'inline-flex',
      color: p.color
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: p.icon,
    size: size,
    strokeWidth: 2
  }));
}
Object.assign(__ds_scope, { PRIORITY, PriorityIcon });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/issues/PriorityIcon.jsx", error: String((e && e.message) || e) }); }

// components/issues/StatusIcon.jsx
try { (() => {
const STATUS = {
  backlog: {
    icon: 'circle-dashed',
    color: 'var(--status-backlog)',
    label: 'Backlog'
  },
  todo: {
    icon: 'circle',
    color: 'var(--status-todo)',
    label: 'Todo'
  },
  in_progress: {
    icon: 'circle-dot',
    color: 'var(--status-progress)',
    label: 'In progress'
  },
  in_review: {
    icon: 'circle-dot',
    color: 'var(--status-review)',
    label: 'In review'
  },
  done: {
    icon: 'circle-check',
    color: 'var(--status-done)',
    label: 'Done'
  },
  canceled: {
    icon: 'circle-x',
    color: 'var(--status-canceled)',
    label: 'Canceled'
  }
};
function StatusIcon({
  status = 'todo',
  size = 14
}) {
  const s = STATUS[status] || STATUS.todo;
  return /*#__PURE__*/React.createElement("span", {
    title: s.label,
    style: {
      display: 'inline-flex',
      color: s.color
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: s.icon,
    size: size,
    strokeWidth: 2
  }));
}
Object.assign(__ds_scope, { STATUS, StatusIcon });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/issues/StatusIcon.jsx", error: String((e && e.message) || e) }); }

// components/issues/BoardColumn.jsx
try { (() => {
function BoardColumn({
  status = 'todo',
  title,
  count,
  onAdd,
  dropActive,
  onDragOver,
  onDrop,
  onDragLeave,
  children,
  style
}) {
  return /*#__PURE__*/React.createElement("section", {
    onDragOver: onDragOver,
    onDrop: onDrop,
    onDragLeave: onDragLeave,
    style: {
      width: 300,
      flex: 'none',
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      padding: 8,
      borderRadius: 'var(--radius-lg)',
      background: dropActive ? 'var(--surface-2)' : 'var(--surface-1)',
      border: '1px solid ' + (dropActive ? 'var(--hairline-strong)' : 'transparent'),
      transition: 'background var(--dur-fast)',
      ...style
    }
  }, /*#__PURE__*/React.createElement("header", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      height: 28,
      padding: '0 4px'
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.StatusIcon, {
    status: status
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      fontWeight: 500,
      color: 'var(--ink)'
    }
  }, title || (__ds_scope.STATUS[status] || {}).label), count != null && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      color: 'var(--ink-subtle)'
    }
  }, count), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1
    }
  }), onAdd && /*#__PURE__*/React.createElement("button", {
    onClick: onAdd,
    "aria-label": "Add issue",
    style: {
      display: 'flex',
      border: 0,
      background: 'transparent',
      color: 'var(--ink-subtle)',
      cursor: 'pointer',
      padding: 4,
      borderRadius: 4
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "plus",
    size: 14
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 8
    }
  }, children));
}
Object.assign(__ds_scope, { BoardColumn });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/issues/BoardColumn.jsx", error: String((e && e.message) || e) }); }

// components/issues/IssueRow.jsx
try { (() => {
function IssueRow({
  id,
  title,
  status,
  priority,
  labels = [],
  assignee,
  date,
  selected,
  onClick,
  style
}) {
  const [h, setH] = React.useState(false);
  return /*#__PURE__*/React.createElement("div", {
    onClick: onClick,
    onMouseEnter: () => setH(true),
    onMouseLeave: () => setH(false),
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      height: 'var(--row-height)',
      padding: '0 16px',
      borderBottom: '1px solid var(--hairline)',
      background: selected ? 'var(--bg-selected)' : h ? 'var(--bg-hover)' : 'transparent',
      fontFamily: 'var(--font-text)',
      fontSize: 13,
      cursor: 'pointer',
      minWidth: 0,
      ...style
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.PriorityIcon, {
    priority: priority
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      width: 64,
      flex: 'none',
      fontFamily: 'var(--font-mono)',
      fontSize: 12,
      color: 'var(--ink-subtle)'
    }
  }, id), /*#__PURE__*/React.createElement(__ds_scope.StatusIcon, {
    status: status
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      minWidth: 0,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
      color: 'var(--ink)',
      fontWeight: 500
    }
  }, title), /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'flex',
      gap: 6,
      flex: 'none'
    }
  }, labels.map(l => /*#__PURE__*/React.createElement(__ds_scope.Tag, {
    key: l.name,
    color: l.color
  }, l.name))), date && /*#__PURE__*/React.createElement("span", {
    style: {
      width: 52,
      flex: 'none',
      textAlign: 'right',
      fontSize: 12,
      color: 'var(--ink-subtle)'
    }
  }, date), /*#__PURE__*/React.createElement("span", {
    style: {
      width: 20,
      flex: 'none',
      display: 'flex'
    }
  }, assignee ? /*#__PURE__*/React.createElement(__ds_scope.Avatar, {
    name: assignee,
    size: 20
  }) : /*#__PURE__*/React.createElement("span", {
    style: {
      width: 20,
      height: 20,
      borderRadius: 9999,
      border: '1px dashed var(--hairline-tertiary)'
    }
  })));
}
Object.assign(__ds_scope, { IssueRow });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/issues/IssueRow.jsx", error: String((e && e.message) || e) }); }

// components/issues/KanbanCard.jsx
try { (() => {
function KanbanCard({
  id,
  title,
  status,
  priority,
  labels = [],
  assignee,
  dragging,
  onClick,
  draggable,
  onDragStart,
  onDragEnd,
  style
}) {
  const [h, setH] = React.useState(false);
  return /*#__PURE__*/React.createElement("div", {
    onClick: onClick,
    draggable: draggable,
    onDragStart: onDragStart,
    onDragEnd: onDragEnd,
    onMouseEnter: () => setH(true),
    onMouseLeave: () => setH(false),
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      padding: '10px 12px 12px',
      borderRadius: 'var(--radius-md)',
      background: h ? 'var(--surface-3)' : 'var(--surface-2)',
      border: '1px solid ' + (h ? 'var(--hairline-strong)' : 'var(--hairline)'),
      boxShadow: dragging ? 'var(--elev-menu)' : 'var(--elev-1)',
      opacity: dragging ? 0.6 : 1,
      cursor: 'pointer',
      fontFamily: 'var(--font-text)',
      transition: 'background var(--dur-fast), border-color var(--dur-fast)',
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: 12,
      color: 'var(--ink-subtle)',
      flex: 1
    }
  }, id), assignee && /*#__PURE__*/React.createElement(__ds_scope.Avatar, {
    name: assignee,
    size: 18
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8,
      alignItems: 'flex-start'
    }
  }, status && /*#__PURE__*/React.createElement("span", {
    style: {
      paddingTop: 2
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.StatusIcon, {
    status: status
  })), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      fontWeight: 500,
      lineHeight: 1.4,
      color: 'var(--ink)',
      textWrap: 'pretty'
    }
  }, title)), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexWrap: 'wrap',
      gap: 6,
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: 22,
      height: 22,
      borderRadius: 'var(--radius-sm)',
      border: '1px solid var(--hairline-strong)'
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.PriorityIcon, {
    priority: priority,
    size: 13
  })), labels.map(l => /*#__PURE__*/React.createElement(__ds_scope.Tag, {
    key: l.name,
    color: l.color
  }, l.name))));
}
Object.assign(__ds_scope, { KanbanCard });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/issues/KanbanCard.jsx", error: String((e && e.message) || e) }); }

// components/navigation/Footer.jsx
try { (() => {
function Footer({
  brand = 'Docket',
  columns = [],
  note,
  style
}) {
  return /*#__PURE__*/React.createElement("footer", {
    style: {
      background: 'var(--canvas)',
      borderTop: '1px solid var(--hairline)',
      padding: '64px 32px',
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 'var(--container-max)',
      margin: '0 auto',
      display: 'grid',
      gridTemplateColumns: 'minmax(160px,1.5fr) repeat(' + Math.max(columns.length, 1) + ', minmax(0,1fr))',
      gap: 32
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 12
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-display)',
      fontWeight: 600,
      fontSize: 16,
      letterSpacing: '-0.4px',
      color: 'var(--ink)'
    }
  }, brand), note && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      color: 'var(--ink-tertiary)'
    }
  }, note)), columns.map(c => /*#__PURE__*/React.createElement("div", {
    key: c.title,
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 10
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      fontWeight: 500,
      color: 'var(--ink)'
    }
  }, c.title), c.links.map(l => /*#__PURE__*/React.createElement("a", {
    key: l,
    href: "#",
    onClick: e => e.preventDefault(),
    style: {
      fontSize: 12,
      color: 'var(--ink-subtle)',
      textDecoration: 'none'
    }
  }, l))))));
}
Object.assign(__ds_scope, { Footer });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/Footer.jsx", error: String((e && e.message) || e) }); }

// components/navigation/SidebarItem.jsx
try { (() => {
function SidebarItem({
  icon,
  label,
  count,
  active,
  indent = 0,
  color,
  onClick,
  style
}) {
  const [h, setH] = React.useState(false);
  return /*#__PURE__*/React.createElement("div", {
    role: "link",
    onClick: onClick,
    onMouseEnter: () => setH(true),
    onMouseLeave: () => setH(false),
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      height: 28,
      padding: '0 8px',
      paddingLeft: 8 + indent * 16,
      borderRadius: 'var(--radius-sm)',
      background: active ? 'var(--bg-selected)' : h ? 'var(--bg-hover)' : 'transparent',
      color: active ? 'var(--ink)' : 'var(--ink-muted)',
      fontFamily: 'var(--font-text)',
      fontSize: 13,
      fontWeight: 500,
      cursor: 'pointer',
      userSelect: 'none',
      ...style
    }
  }, icon && /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'flex',
      color: color || (active ? 'var(--ink)' : 'var(--ink-subtle)')
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: icon,
    size: 15
  })), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap'
    }
  }, label), count != null && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      color: 'var(--ink-subtle)'
    }
  }, count));
}
Object.assign(__ds_scope, { SidebarItem });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/SidebarItem.jsx", error: String((e && e.message) || e) }); }

// components/navigation/TopNav.jsx
try { (() => {
function Link({
  label,
  active,
  onClick
}) {
  const [h, setH] = React.useState(false);
  return /*#__PURE__*/React.createElement("a", {
    href: "#",
    onClick: e => {
      e.preventDefault();
      onClick && onClick(label);
    },
    onMouseEnter: () => setH(true),
    onMouseLeave: () => setH(false),
    style: {
      fontSize: 14,
      color: active || h ? 'var(--ink)' : 'var(--ink-subtle)',
      textDecoration: 'none',
      transition: 'color var(--dur-fast)'
    }
  }, label);
}
function TopNav({
  brand = 'Docket',
  links = [],
  active,
  onNavigate,
  actions,
  style
}) {
  return /*#__PURE__*/React.createElement("header", {
    style: {
      position: 'sticky',
      top: 0,
      zIndex: 10,
      height: 'var(--nav-height)',
      background: 'var(--nav-bg)',
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
      borderBottom: '1px solid var(--hairline)',
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 'var(--container-max)',
      height: '100%',
      margin: '0 auto',
      padding: '0 32px',
      display: 'flex',
      alignItems: 'center',
      gap: 32
    }
  }, /*#__PURE__*/React.createElement("a", {
    href: "#",
    onClick: e => {
      e.preventDefault();
      onNavigate && onNavigate('home');
    },
    style: {
      fontFamily: 'var(--font-display)',
      fontWeight: 600,
      fontSize: 18,
      letterSpacing: '-0.5px',
      color: 'var(--ink)',
      textDecoration: 'none'
    }
  }, brand), /*#__PURE__*/React.createElement("nav", {
    style: {
      display: 'flex',
      gap: 24,
      flex: 1
    }
  }, links.map(l => /*#__PURE__*/React.createElement(Link, {
    key: l,
    label: l,
    active: l === active,
    onClick: onNavigate
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8,
      alignItems: 'center'
    }
  }, actions)));
}
Object.assign(__ds_scope, { TopNav });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/TopNav.jsx", error: String((e && e.message) || e) }); }

// components/surfaces/Card.jsx
try { (() => {
const V = {
  feature: {
    bg: 'var(--surface-1)',
    r: 'var(--radius-lg)',
    p: 24,
    b: 'var(--hairline)'
  },
  pricing: {
    bg: 'var(--surface-1)',
    r: 'var(--radius-lg)',
    p: 24,
    b: 'var(--hairline)'
  },
  featured: {
    bg: 'var(--surface-2)',
    r: 'var(--radius-lg)',
    p: 24,
    b: 'var(--hairline-strong)'
  },
  screenshot: {
    bg: 'var(--surface-1)',
    r: 'var(--radius-xl)',
    p: 24,
    b: 'var(--hairline)'
  },
  testimonial: {
    bg: 'var(--surface-1)',
    r: 'var(--radius-lg)',
    p: 32,
    b: 'var(--hairline)'
  },
  cta: {
    bg: 'var(--surface-1)',
    r: 'var(--radius-lg)',
    p: 48,
    b: 'var(--hairline)'
  }
};
function Card({
  variant = 'feature',
  interactive,
  padding,
  children,
  onClick,
  style
}) {
  const [h, setH] = React.useState(false);
  const v = V[variant] || V.feature;
  const lift = interactive && h;
  return /*#__PURE__*/React.createElement("div", {
    onClick: onClick,
    onMouseEnter: () => setH(true),
    onMouseLeave: () => setH(false),
    style: {
      background: lift ? 'var(--surface-2)' : v.bg,
      border: '1px solid ' + (lift ? 'var(--hairline-strong)' : v.b),
      borderRadius: v.r,
      padding: padding ?? v.p,
      boxShadow: 'var(--elev-1)',
      color: 'var(--ink)',
      cursor: interactive ? 'pointer' : undefined,
      transition: 'background var(--dur-base), border-color var(--dur-base)',
      ...style
    }
  }, children);
}
Object.assign(__ds_scope, { Card });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/surfaces/Card.jsx", error: String((e && e.message) || e) }); }

// components/surfaces/ChangelogRow.jsx
try { (() => {
function ChangelogRow({
  date,
  version,
  title,
  children,
  style
}) {
  return /*#__PURE__*/React.createElement("article", {
    style: {
      display: 'grid',
      gridTemplateColumns: '160px minmax(0,1fr)',
      gap: 32,
      padding: '24px 0',
      borderBottom: '1px solid var(--hairline)',
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 4
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 14,
      color: 'var(--ink-subtle)'
    }
  }, date), version && /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: 12,
      color: 'var(--ink-tertiary)'
    }
  }, version)), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("h3", {
    style: {
      margin: 0,
      fontFamily: 'var(--font-display)',
      fontSize: 22,
      fontWeight: 500,
      lineHeight: 1.25,
      letterSpacing: '-0.4px',
      color: 'var(--ink)'
    }
  }, title), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 16,
      lineHeight: 1.5,
      color: 'var(--ink-muted)'
    }
  }, children)));
}
Object.assign(__ds_scope, { ChangelogRow });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/surfaces/ChangelogRow.jsx", error: String((e && e.message) || e) }); }

// components/surfaces/Menu.jsx
try { (() => {
function Item({
  it,
  onSelect
}) {
  const [h, setH] = React.useState(false);
  return /*#__PURE__*/React.createElement("div", {
    role: "menuitem",
    onClick: () => onSelect && onSelect(it),
    onMouseEnter: () => setH(true),
    onMouseLeave: () => setH(false),
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      height: 30,
      padding: '0 8px',
      borderRadius: 'var(--radius-sm)',
      background: h ? 'var(--bg-selected)' : 'transparent',
      color: it.danger ? 'var(--danger)' : 'var(--ink)',
      fontSize: 13,
      cursor: 'pointer'
    }
  }, it.icon && /*#__PURE__*/React.createElement("span", {
    style: {
      color: it.iconColor || 'var(--ink-subtle)',
      display: 'flex'
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: it.icon,
    size: 14
  })), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      whiteSpace: 'nowrap'
    }
  }, it.label), it.selected && /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "check",
    size: 14,
    color: "var(--ink-muted)"
  }), it.kbd && /*#__PURE__*/React.createElement(__ds_scope.Kbd, null, it.kbd));
}
function Menu({
  items = [],
  title,
  width = 220,
  onSelect,
  style
}) {
  return /*#__PURE__*/React.createElement("div", {
    role: "menu",
    style: {
      width,
      padding: 4,
      borderRadius: 'var(--radius-md)',
      background: 'var(--surface-3)',
      boxShadow: 'var(--elev-menu)',
      fontFamily: 'var(--font-text)',
      ...style
    }
  }, title && /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '6px 8px 4px',
      fontSize: 12,
      color: 'var(--ink-subtle)'
    }
  }, title), items.map((it, i) => it.divider ? /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      height: 1,
      margin: '4px -4px',
      background: 'var(--hairline-strong)'
    }
  }) : /*#__PURE__*/React.createElement(Item, {
    key: i,
    it: it,
    onSelect: onSelect
  })));
}
Object.assign(__ds_scope, { Menu });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/surfaces/Menu.jsx", error: String((e && e.message) || e) }); }

// ui_kits/app/Board.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function Board({
  issues,
  labels,
  statuses,
  onOpen,
  onMove,
  onCreate
}) {
  const {
    BoardColumn,
    KanbanCard
  } = window.DocketDesignSystem_e2ed17;
  const [drag, setDrag] = React.useState(null);
  const [over, setOver] = React.useState(null);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      overflow: 'auto',
      display: 'flex',
      gap: 12,
      padding: 16,
      alignItems: 'flex-start'
    }
  }, statuses.map(st => {
    const g = issues.filter(i => i.status === st);
    return /*#__PURE__*/React.createElement(BoardColumn, {
      key: st,
      status: st,
      count: g.length,
      onAdd: () => onCreate(st),
      dropActive: over === st && drag,
      onDragOver: e => {
        e.preventDefault();
        setOver(st);
      },
      onDragLeave: () => setOver(null),
      onDrop: e => {
        e.preventDefault();
        if (drag) onMove(drag, st);
        setDrag(null);
        setOver(null);
      },
      style: {
        width: 272
      }
    }, g.map(i => /*#__PURE__*/React.createElement(KanbanCard, _extends({
      key: i.id
    }, i, {
      labels: i.labels.map(l => labels[l]),
      draggable: true,
      dragging: drag === i.id,
      onDragStart: e => {
        e.dataTransfer.effectAllowed = 'move';
        setDrag(i.id);
      },
      onDragEnd: () => {
        setDrag(null);
        setOver(null);
      },
      onClick: () => onOpen(i.id)
    }))));
  }));
}
Object.assign(window, {
  Board
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/app/Board.jsx", error: String((e && e.message) || e) }); }

// ui_kits/app/CreateIssue.jsx
try { (() => {
function CreateIssue({
  initialStatus = 'todo',
  onClose,
  onCreate,
  teamKey,
  nextId
}) {
  const {
    Button,
    IconButton,
    StatusIcon,
    PriorityIcon,
    Icon,
    Kbd
  } = window.DocketDesignSystem_e2ed17;
  const [title, setTitle] = React.useState('');
  const [desc, setDesc] = React.useState('');
  const [prio, setPrio] = React.useState('none');
  const ref = React.useRef(null);
  React.useEffect(() => {
    ref.current && ref.current.focus();
  }, []);
  const names = {
    backlog: 'Backlog',
    todo: 'Todo',
    in_progress: 'In progress',
    in_review: 'In review',
    done: 'Done'
  };
  const cycle = ['none', 'low', 'medium', 'high', 'urgent'];
  const chip = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    height: 26,
    padding: '0 8px',
    borderRadius: 6,
    border: '1px solid var(--hairline-strong)',
    background: 'var(--surface-3)',
    color: 'var(--ink-muted)',
    fontSize: 12,
    fontWeight: 500,
    cursor: 'pointer',
    fontFamily: 'var(--font-text)'
  };
  const submit = () => {
    if (title.trim()) onCreate({
      title,
      desc,
      priority: prio,
      status: initialStatus
    });
  };
  return /*#__PURE__*/React.createElement("div", {
    onClick: onClose,
    style: {
      position: 'fixed',
      inset: 0,
      background: 'var(--overlay)',
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'center',
      paddingTop: '14vh',
      zIndex: 50
    }
  }, /*#__PURE__*/React.createElement("div", {
    onClick: e => e.stopPropagation(),
    onKeyDown: e => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit();
    },
    style: {
      width: 640,
      maxWidth: 'calc(100vw - 32px)',
      background: 'var(--surface-2)',
      borderRadius: 'var(--radius-lg)',
      boxShadow: 'var(--elev-dialog)',
      display: 'flex',
      flexDirection: 'column'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '14px 16px 0',
      fontSize: 12,
      color: 'var(--ink-subtle)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      ...chip,
      cursor: 'default'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "box",
    size: 12,
    color: "var(--primary)"
  }), teamKey), /*#__PURE__*/React.createElement(Icon, {
    name: "chevron-right",
    size: 12
  }), "New issue", /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1
    }
  }), /*#__PURE__*/React.createElement(IconButton, {
    icon: "x",
    size: "sm",
    label: "Close",
    onClick: onClose
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '12px 16px',
      display: 'flex',
      flexDirection: 'column',
      gap: 6
    }
  }, /*#__PURE__*/React.createElement("input", {
    ref: ref,
    value: title,
    onChange: e => setTitle(e.target.value),
    placeholder: "Issue title",
    style: {
      border: 0,
      outline: 0,
      background: 'transparent',
      color: 'var(--ink)',
      fontFamily: 'var(--font-display)',
      fontSize: 18,
      fontWeight: 500,
      letterSpacing: '-0.3px'
    }
  }), /*#__PURE__*/React.createElement("textarea", {
    value: desc,
    onChange: e => setDesc(e.target.value),
    placeholder: "Add description\u2026",
    rows: 3,
    style: {
      resize: 'none',
      border: 0,
      outline: 0,
      background: 'transparent',
      color: 'var(--ink-muted)',
      fontFamily: 'var(--font-text)',
      fontSize: 14,
      lineHeight: 1.5
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 6,
      padding: '0 16px 14px',
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: chip
  }, /*#__PURE__*/React.createElement(StatusIcon, {
    status: initialStatus,
    size: 12
  }), names[initialStatus]), /*#__PURE__*/React.createElement("span", {
    style: chip,
    onClick: () => setPrio(p => cycle[(cycle.indexOf(p) + 1) % cycle.length])
  }, /*#__PURE__*/React.createElement(PriorityIcon, {
    priority: prio,
    size: 12
  }), prio === 'none' ? 'Priority' : prio[0].toUpperCase() + prio.slice(1)), /*#__PURE__*/React.createElement("span", {
    style: chip
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "user",
    size: 12
  }), "Assignee"), /*#__PURE__*/React.createElement("span", {
    style: chip
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "tag",
    size: 12
  }), "Labels")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '10px 16px',
      borderTop: '1px solid var(--hairline)'
    }
  }, /*#__PURE__*/React.createElement(IconButton, {
    icon: "paperclip",
    size: "sm",
    label: "Attach"
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      color: 'var(--ink-subtle)',
      display: 'flex',
      gap: 4,
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement(Kbd, null, "\u2318"), /*#__PURE__*/React.createElement(Kbd, null, "\u21B5")), /*#__PURE__*/React.createElement(Button, {
    size: "sm",
    onClick: submit,
    disabled: !title.trim()
  }, "Create issue"))));
}
Object.assign(window, {
  CreateIssue
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/app/CreateIssue.jsx", error: String((e && e.message) || e) }); }

// ui_kits/app/IssueDetail.jsx
try { (() => {
function PropRow({
  label,
  children,
  onClick
}) {
  const [h, setH] = React.useState(false);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      minHeight: 32,
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 84,
      flex: 'none',
      fontSize: 12,
      color: 'var(--ink-subtle)'
    }
  }, label), /*#__PURE__*/React.createElement("span", {
    onClick: onClick,
    onMouseEnter: () => setH(true),
    onMouseLeave: () => setH(false),
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      flexWrap: 'wrap',
      padding: '4px 6px',
      margin: '0 -6px',
      borderRadius: 6,
      background: h && onClick ? 'var(--bg-hover)' : 'transparent',
      fontSize: 13,
      cursor: onClick ? 'pointer' : 'default'
    }
  }, children));
}
function IssueDetail({
  issue,
  labels,
  activity,
  onBack,
  onStatus
}) {
  const D = window.DocketDesignSystem_e2ed17;
  const {
    StatusIcon,
    PriorityIcon,
    Avatar,
    Tag,
    Button,
    IconButton,
    Menu,
    Icon
  } = D;
  const [menu, setMenu] = React.useState(false);
  const [comments, setComments] = React.useState(activity);
  const [draft, setDraft] = React.useState('');
  const names = {
    backlog: 'Backlog',
    todo: 'Todo',
    in_progress: 'In progress',
    in_review: 'In review',
    done: 'Done',
    canceled: 'Canceled'
  };
  const prio = {
    none: 'No priority',
    urgent: 'Urgent',
    high: 'High',
    medium: 'Medium',
    low: 'Low'
  };
  const send = () => {
    if (!draft.trim()) return;
    setComments(c => [...c, {
      who: 'Mara Ortiz',
      comment: draft,
      when: 'just now'
    }]);
    setDraft('');
  };
  return /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      minHeight: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      height: 48,
      flex: 'none',
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '0 16px',
      borderBottom: '1px solid var(--hairline)'
    }
  }, /*#__PURE__*/React.createElement(IconButton, {
    icon: "chevron-left",
    label: "Back",
    onClick: onBack
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      color: 'var(--ink-subtle)'
    }
  }, "Engineering"), /*#__PURE__*/React.createElement(Icon, {
    name: "chevron-right",
    size: 12,
    color: "var(--ink-tertiary)"
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      fontFamily: 'var(--font-mono)',
      color: 'var(--ink-muted)'
    }
  }, issue.id), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1
    }
  }), /*#__PURE__*/React.createElement(IconButton, {
    icon: "link",
    label: "Copy link"
  }), /*#__PURE__*/React.createElement(IconButton, {
    icon: "star",
    label: "Favorite"
  }), /*#__PURE__*/React.createElement(IconButton, {
    icon: "ellipsis",
    label: "More"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      display: 'flex',
      minHeight: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      overflow: 'auto',
      padding: '32px 48px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 680,
      display: 'flex',
      flexDirection: 'column',
      gap: 16
    }
  }, /*#__PURE__*/React.createElement("h1", {
    style: {
      margin: 0,
      fontFamily: 'var(--font-display)',
      fontSize: 24,
      fontWeight: 600,
      letterSpacing: '-0.5px',
      lineHeight: 1.25
    }
  }, issue.title), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontSize: 15,
      lineHeight: 1.6,
      color: issue.desc ? 'var(--ink-muted)' : 'var(--ink-tertiary)'
    }
  }, issue.desc || 'Add description…'), /*#__PURE__*/React.createElement("div", {
    style: {
      height: 1,
      background: 'var(--hairline)',
      margin: '16px 0 4px'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 14,
      fontWeight: 500
    }
  }, "Activity"), comments.map((a, i) => a.comment ? /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      background: 'var(--surface-2)',
      border: '1px solid var(--hairline)',
      borderRadius: 10,
      padding: '12px 14px',
      display: 'flex',
      flexDirection: 'column',
      gap: 6
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      fontSize: 13
    }
  }, /*#__PURE__*/React.createElement(Avatar, {
    name: a.who,
    size: 18
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontWeight: 500
    }
  }, a.who), /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--ink-subtle)',
      fontSize: 12
    }
  }, a.when)), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 14,
      lineHeight: 1.5,
      color: 'var(--ink-muted)'
    }
  }, a.comment)) : /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      fontSize: 12,
      color: 'var(--ink-subtle)',
      paddingLeft: 2
    }
  }, /*#__PURE__*/React.createElement(Avatar, {
    name: a.who,
    size: 16
  }), /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--ink-muted)'
    }
  }, a.who), " ", a.text, " \xB7 ", a.when))), /*#__PURE__*/React.createElement("div", {
    style: {
      border: '1px solid var(--hairline)',
      borderRadius: 10,
      background: 'var(--surface-1)',
      padding: 12,
      display: 'flex',
      flexDirection: 'column',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("textarea", {
    value: draft,
    onChange: e => setDraft(e.target.value),
    onKeyDown: e => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send();
    },
    placeholder: "Leave a comment\u2026",
    rows: 2,
    style: {
      resize: 'none',
      border: 0,
      outline: 0,
      background: 'transparent',
      color: 'var(--ink)',
      fontFamily: 'var(--font-text)',
      fontSize: 14
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 6
    }
  }, /*#__PURE__*/React.createElement(IconButton, {
    icon: "paperclip",
    size: "sm",
    label: "Attach"
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1
    }
  }), /*#__PURE__*/React.createElement(Button, {
    size: "sm",
    variant: "secondary",
    onClick: send
  }, "Comment"))))), /*#__PURE__*/React.createElement("aside", {
    style: {
      width: 280,
      flex: 'none',
      borderLeft: '1px solid var(--hairline)',
      padding: '20px 20px',
      display: 'flex',
      flexDirection: 'column',
      gap: 2,
      position: 'relative'
    }
  }, /*#__PURE__*/React.createElement(PropRow, {
    label: "Status",
    onClick: () => setMenu(m => !m)
  }, /*#__PURE__*/React.createElement(StatusIcon, {
    status: issue.status
  }), names[issue.status]), menu && /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top: 54,
      left: 104,
      zIndex: 5
    }
  }, /*#__PURE__*/React.createElement(Menu, {
    title: "Change status",
    width: 200,
    onSelect: it => {
      onStatus(issue.id, it.key);
      setMenu(false);
    },
    items: ['backlog', 'todo', 'in_progress', 'in_review', 'done'].map((s, i) => ({
      key: s,
      label: names[s],
      icon: {
        backlog: 'circle-dashed',
        todo: 'circle',
        in_progress: 'circle-dot',
        in_review: 'circle-dot',
        done: 'circle-check'
      }[s],
      iconColor: `var(--status-${{
        in_progress: 'progress',
        in_review: 'review'
      }[s] || s})`,
      kbd: String(i + 1),
      selected: s === issue.status
    }))
  })), /*#__PURE__*/React.createElement(PropRow, {
    label: "Priority",
    onClick: () => {}
  }, /*#__PURE__*/React.createElement(PriorityIcon, {
    priority: issue.priority
  }), prio[issue.priority]), /*#__PURE__*/React.createElement(PropRow, {
    label: "Assignee",
    onClick: () => {}
  }, issue.assignee ? /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(Avatar, {
    name: issue.assignee,
    size: 18
  }), issue.assignee) : /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--ink-subtle)'
    }
  }, "Unassigned")), /*#__PURE__*/React.createElement(PropRow, {
    label: "Labels"
  }, issue.labels.length ? issue.labels.map(l => /*#__PURE__*/React.createElement(Tag, {
    key: l,
    color: labels[l].color
  }, labels[l].name)) : /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--ink-subtle)'
    }
  }, "None")), /*#__PURE__*/React.createElement(PropRow, {
    label: "Project",
    onClick: () => {}
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "layers",
    size: 14,
    color: "var(--ink-subtle)"
  }), issue.project), /*#__PURE__*/React.createElement(PropRow, {
    label: "Due date",
    onClick: () => {}
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "calendar",
    size: 14,
    color: "var(--ink-subtle)"
  }), issue.date || '—'), /*#__PURE__*/React.createElement("div", {
    style: {
      height: 1,
      background: 'var(--hairline)',
      margin: '14px 0'
    }
  }), /*#__PURE__*/React.createElement(PropRow, {
    label: "Branch"
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: 12,
      color: 'var(--ink-muted)'
    }
  }, issue.id.toLowerCase(), "-fix")))));
}
Object.assign(window, {
  IssueDetail
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/app/IssueDetail.jsx", error: String((e && e.message) || e) }); }

// ui_kits/app/IssueList.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function ViewHeader({
  title,
  view,
  setView,
  onCreate
}) {
  const {
    Button,
    IconButton,
    SegmentedTabs,
    Icon
  } = window.DocketDesignSystem_e2ed17;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      height: 48,
      flex: 'none',
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '0 16px',
      borderBottom: '1px solid var(--hairline)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      color: 'var(--ink-subtle)'
    }
  }, "Engineering"), /*#__PURE__*/React.createElement(Icon, {
    name: "chevron-right",
    size: 12,
    color: "var(--ink-tertiary)"
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      fontWeight: 500
    }
  }, title), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1
    }
  }), setView && /*#__PURE__*/React.createElement(SegmentedTabs, {
    options: [{
      value: 'list',
      label: 'List'
    }, {
      value: 'board',
      label: 'Board'
    }],
    value: view,
    onChange: setView,
    style: {
      transform: 'scale(.86)',
      transformOrigin: 'right center'
    }
  }), /*#__PURE__*/React.createElement(Button, {
    size: "sm",
    variant: "secondary",
    icon: "list-filter"
  }, "Filter"), /*#__PURE__*/React.createElement(IconButton, {
    icon: "sliders-horizontal",
    label: "Display options"
  }), /*#__PURE__*/React.createElement(Button, {
    size: "sm",
    icon: "plus",
    onClick: onCreate
  }, "New issue"));
}
function IssueList({
  issues,
  labels,
  onOpen,
  onCreate,
  selected
}) {
  const {
    IssueRow,
    StatusIcon,
    IconButton
  } = window.DocketDesignSystem_e2ed17;
  const order = ['in_progress', 'in_review', 'todo', 'backlog', 'done'];
  const names = {
    backlog: 'Backlog',
    todo: 'Todo',
    in_progress: 'In progress',
    in_review: 'In review',
    done: 'Done'
  };
  return /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      overflow: 'auto'
    }
  }, order.map(st => {
    const g = issues.filter(i => i.status === st);
    if (!g.length) return null;
    return /*#__PURE__*/React.createElement("div", {
      key: st
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        position: 'sticky',
        top: 0,
        zIndex: 1,
        height: 36,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '0 16px',
        background: 'var(--surface-2)',
        borderBottom: '1px solid var(--hairline)',
        fontSize: 13
      }
    }, /*#__PURE__*/React.createElement(StatusIcon, {
      status: st
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        fontWeight: 500
      }
    }, names[st]), /*#__PURE__*/React.createElement("span", {
      style: {
        color: 'var(--ink-subtle)'
      }
    }, g.length), /*#__PURE__*/React.createElement("span", {
      style: {
        flex: 1
      }
    }), /*#__PURE__*/React.createElement(IconButton, {
      icon: "plus",
      size: "sm",
      label: "Add issue",
      onClick: () => onCreate(st)
    })), g.map(i => /*#__PURE__*/React.createElement(IssueRow, _extends({
      key: i.id
    }, i, {
      labels: i.labels.map(l => labels[l]),
      selected: selected === i.id,
      onClick: () => onOpen(i.id)
    }))));
  }));
}
Object.assign(window, {
  ViewHeader,
  IssueList
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/app/IssueList.jsx", error: String((e && e.message) || e) }); }

// ui_kits/app/Sidebar.jsx
try { (() => {
function AppSidebar({
  view,
  setView,
  counts,
  onCreate,
  theme,
  onTheme
}) {
  const {
    SidebarItem,
    IconButton,
    Avatar,
    Icon
  } = window.DocketDesignSystem_e2ed17;
  const sec = {
    fontSize: 12,
    fontWeight: 500,
    color: 'var(--ink-subtle)',
    padding: '14px 8px 4px',
    display: 'flex',
    alignItems: 'center',
    gap: 6
  };
  return /*#__PURE__*/React.createElement("aside", {
    style: {
      width: 'var(--sidebar-width)',
      flex: 'none',
      display: 'flex',
      flexDirection: 'column',
      gap: 1,
      padding: '10px 8px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '0 4px 10px'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 22,
      height: 22,
      borderRadius: 6,
      background: 'var(--primary)',
      color: 'var(--on-primary)',
      fontSize: 12,
      fontWeight: 600,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, "D"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 14,
      fontWeight: 600,
      letterSpacing: '-0.2px',
      flex: 1
    }
  }, "Docket"), /*#__PURE__*/React.createElement(IconButton, {
    icon: "search",
    size: "sm",
    label: "Search"
  }), /*#__PURE__*/React.createElement(IconButton, {
    icon: "square-pen",
    size: "sm",
    variant: "secondary",
    label: "New issue (C)",
    onClick: onCreate
  })), /*#__PURE__*/React.createElement(SidebarItem, {
    icon: "inbox",
    label: "Inbox",
    count: 3,
    active: view === 'inbox',
    onClick: () => setView('inbox')
  }), /*#__PURE__*/React.createElement(SidebarItem, {
    icon: "circle-user",
    label: "My issues",
    active: view === 'mine',
    onClick: () => setView('mine')
  }), /*#__PURE__*/React.createElement("div", {
    style: sec
  }, "Workspace"), /*#__PURE__*/React.createElement(SidebarItem, {
    icon: "layers",
    label: "Projects"
  }), /*#__PURE__*/React.createElement(SidebarItem, {
    icon: "target",
    label: "Cycles"
  }), /*#__PURE__*/React.createElement("div", {
    style: sec
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "chevron-down",
    size: 12
  }), "Your teams"), /*#__PURE__*/React.createElement(SidebarItem, {
    icon: "box",
    label: "Engineering",
    color: "var(--primary)"
  }), /*#__PURE__*/React.createElement(SidebarItem, {
    icon: "list",
    label: "Issues",
    indent: 1,
    count: counts.all,
    active: view === 'list',
    onClick: () => setView('list')
  }), /*#__PURE__*/React.createElement(SidebarItem, {
    icon: "square-kanban",
    label: "Board",
    indent: 1,
    active: view === 'board',
    onClick: () => setView('board')
  }), /*#__PURE__*/React.createElement(SidebarItem, {
    icon: "target",
    label: "Cycles",
    indent: 1
  }), /*#__PURE__*/React.createElement(SidebarItem, {
    icon: "box",
    label: "Design",
    color: "var(--label-plum)"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '8px 8px 2px',
      fontSize: 13,
      color: 'var(--ink-muted)'
    }
  }, /*#__PURE__*/React.createElement(Avatar, {
    name: "Mara Ortiz",
    size: 20
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1
    }
  }, "Mara Ortiz"), /*#__PURE__*/React.createElement(IconButton, {
    icon: theme === 'light' ? 'moon' : 'sun',
    size: "sm",
    label: theme === 'light' ? 'Dark mode' : 'Light mode',
    onClick: onTheme
  })));
}
Object.assign(window, {
  AppSidebar
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/app/Sidebar.jsx", error: String((e && e.message) || e) }); }

// ui_kits/app/data.js
try { (() => {
window.DOCKET_DATA = {
  team: {
    key: 'DOC',
    name: 'Engineering'
  },
  people: ['Mara Ortiz', 'Jun Park', 'Sol Amari', 'Theo Lind', 'Ines Varga'],
  labels: {
    bug: {
      name: 'Bug',
      color: 'var(--label-eraser)'
    },
    feature: {
      name: 'Feature',
      color: 'var(--label-sage)'
    },
    backend: {
      name: 'Backend',
      color: 'var(--label-slate)'
    },
    design: {
      name: 'Design',
      color: 'var(--label-plum)'
    },
    perf: {
      name: 'Performance',
      color: 'var(--label-mustard)'
    }
  },
  statuses: ['backlog', 'todo', 'in_progress', 'in_review', 'done'],
  issues: [{
    id: 'DOC-1284',
    title: 'Fix flaky sync on reconnect',
    status: 'in_progress',
    priority: 'urgent',
    labels: ['bug', 'backend'],
    assignee: 'Mara Ortiz',
    date: 'Oct 28',
    project: 'Offline mode',
    desc: 'When the socket drops for more than 30 seconds, queued mutations replay out of order. Reproduce by toggling network in devtools while editing an issue title.'
  }, {
    id: 'DOC-1290',
    title: 'Board swimlanes by assignee',
    status: 'todo',
    priority: 'medium',
    labels: ['feature'],
    assignee: 'Jun Park',
    date: 'Nov 2',
    project: 'Boards v2',
    desc: 'Allow grouping any board by assignee, project or label. Swimlanes collapse independently and remember state per view.'
  }, {
    id: 'DOC-1291',
    title: 'Column WIP limits',
    status: 'todo',
    priority: 'low',
    labels: ['feature'],
    assignee: 'Sol Amari',
    date: 'Nov 4',
    project: 'Boards v2',
    desc: 'Show a warning in the column header when the number of issues exceeds the configured limit.'
  }, {
    id: 'DOC-1277',
    title: 'Ship cycle burn-up chart',
    status: 'in_review',
    priority: 'high',
    labels: ['feature', 'design'],
    assignee: 'Sol Amari',
    date: 'Oct 26',
    project: 'Cycles',
    desc: 'Burn-up replaces the burn-down on the cycle page. Scope line is dashed; completed is solid eraser.'
  }, {
    id: 'DOC-1279',
    title: 'Reduce issue list render time on 5k rows',
    status: 'in_progress',
    priority: 'high',
    labels: ['perf'],
    assignee: 'Theo Lind',
    date: 'Oct 30',
    project: 'Offline mode',
    desc: 'Virtualise the grouped list and memoise row props. Target under 16ms per frame while scrolling.'
  }, {
    id: 'DOC-1301',
    title: 'Audit keyboard shortcuts for conflicts',
    status: 'backlog',
    priority: 'none',
    labels: [],
    assignee: null,
    date: '',
    project: 'Polish',
    desc: ''
  }, {
    id: 'DOC-1302',
    title: 'Empty state for filtered views',
    status: 'backlog',
    priority: 'low',
    labels: ['design'],
    assignee: 'Ines Varga',
    date: '',
    project: 'Polish',
    desc: ''
  }, {
    id: 'DOC-1268',
    title: 'Migrate attachments to signed URLs',
    status: 'done',
    priority: 'medium',
    labels: ['backend'],
    assignee: 'Theo Lind',
    date: 'Oct 20',
    project: 'Security',
    desc: ''
  }, {
    id: 'DOC-1270',
    title: 'Due date picker respects workweek',
    status: 'done',
    priority: 'low',
    labels: ['bug'],
    assignee: 'Jun Park',
    date: 'Oct 22',
    project: 'Polish',
    desc: ''
  }],
  activity: [{
    who: 'Mara Ortiz',
    text: 'moved from Todo to In progress',
    when: '2h ago'
  }, {
    who: 'Theo Lind',
    comment: 'Seeing the same on Safari. The replay queue is keyed by local timestamp, which drifts after sleep.',
    when: '1h ago'
  }]
};
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/app/data.js", error: String((e && e.message) || e) }); }

// ui_kits/website/Home.jsx
try { (() => {
function Section({
  children,
  style
}) {
  return /*#__PURE__*/React.createElement("section", {
    style: {
      maxWidth: 'var(--container-max)',
      margin: '0 auto',
      padding: '0 32px',
      ...style
    }
  }, children);
}
function Eyebrow({
  children
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      fontWeight: 500,
      letterSpacing: '0.4px',
      textTransform: 'uppercase',
      color: 'var(--ink-subtle)'
    }
  }, children);
}
function ProductShot() {
  const {
    IssueRow,
    StatusIcon,
    SidebarItem,
    Card
  } = window.DocketDesignSystem_e2ed17;
  const L = {
    bug: {
      name: 'Bug',
      color: 'var(--label-eraser)'
    },
    feat: {
      name: 'Feature',
      color: 'var(--label-sage)'
    },
    perf: {
      name: 'Performance',
      color: 'var(--label-mustard)'
    }
  };
  const rows = [['DOC-1284', 'Fix flaky sync on reconnect', 'in_progress', 'urgent', [L.bug], 'Mara Ortiz', 'Oct 28'], ['DOC-1279', 'Reduce list render time on 5k rows', 'in_progress', 'high', [L.perf], 'Theo Lind', 'Oct 30'], ['DOC-1290', 'Board swimlanes by assignee', 'todo', 'medium', [L.feat], 'Jun Park', 'Nov 2'], ['DOC-1291', 'Column WIP limits', 'todo', 'low', [L.feat], 'Sol Amari', 'Nov 4']];
  return /*#__PURE__*/React.createElement(Card, {
    variant: "screenshot",
    padding: 0,
    style: {
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      height: 380,
      pointerEvents: 'none'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 200,
      padding: 10,
      display: 'flex',
      flexDirection: 'column',
      gap: 1,
      borderRight: '1px solid var(--hairline)',
      background: 'var(--canvas)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      fontWeight: 600,
      padding: '4px 8px 10px'
    }
  }, "Docket"), /*#__PURE__*/React.createElement(SidebarItem, {
    icon: "inbox",
    label: "Inbox",
    count: 3
  }), /*#__PURE__*/React.createElement(SidebarItem, {
    icon: "circle-user",
    label: "My issues"
  }), /*#__PURE__*/React.createElement(SidebarItem, {
    icon: "layers",
    label: "Projects"
  }), /*#__PURE__*/React.createElement(SidebarItem, {
    icon: "list",
    label: "Issues",
    active: true
  }), /*#__PURE__*/React.createElement(SidebarItem, {
    icon: "square-kanban",
    label: "Board"
  }), /*#__PURE__*/React.createElement(SidebarItem, {
    icon: "target",
    label: "Cycles"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      height: 44,
      display: 'flex',
      alignItems: 'center',
      padding: '0 16px',
      fontSize: 13,
      borderBottom: '1px solid var(--hairline)',
      color: 'var(--ink-muted)'
    }
  }, "Engineering \u203A Issues"), /*#__PURE__*/React.createElement("div", {
    style: {
      height: 34,
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '0 16px',
      background: 'var(--surface-2)',
      borderBottom: '1px solid var(--hairline)',
      fontSize: 13
    }
  }, /*#__PURE__*/React.createElement(StatusIcon, {
    status: "in_progress"
  }), "In progress ", /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--ink-subtle)'
    }
  }, "2")), rows.slice(0, 2).map(r => /*#__PURE__*/React.createElement(IssueRow, {
    key: r[0],
    id: r[0],
    title: r[1],
    status: r[2],
    priority: r[3],
    labels: r[4],
    assignee: r[5],
    date: r[6]
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      height: 34,
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '0 16px',
      background: 'var(--surface-2)',
      borderBottom: '1px solid var(--hairline)',
      fontSize: 13
    }
  }, /*#__PURE__*/React.createElement(StatusIcon, {
    status: "todo"
  }), "Todo ", /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--ink-subtle)'
    }
  }, "2")), rows.slice(2).map(r => /*#__PURE__*/React.createElement(IssueRow, {
    key: r[0],
    id: r[0],
    title: r[1],
    status: r[2],
    priority: r[3],
    labels: r[4],
    assignee: r[5],
    date: r[6]
  })))));
}
function HomePage({
  go
}) {
  const {
    Button,
    Card,
    Badge,
    Avatar,
    Icon
  } = window.DocketDesignSystem_e2ed17;
  const feats = [['square-kanban', 'Boards that keep up', 'Drag issues across columns, set WIP limits and group by assignee without leaving the keyboard.'], ['target', 'Cycles', 'Two-week cadences that roll unfinished work forward and report scope change honestly.'], ['git-branch', 'Linked to your code', 'Branch names, pull requests and merges update issue status automatically.']];
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(Section, {
    style: {
      padding: '120px 32px 64px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'flex-start',
      gap: 24
    }
  }, /*#__PURE__*/React.createElement(Badge, {
    tone: "primary"
  }, "New \xB7 Board swimlanes"), /*#__PURE__*/React.createElement("h1", {
    style: {
      margin: 0,
      maxWidth: 900,
      fontFamily: 'var(--font-display)',
      fontSize: 80,
      fontWeight: 600,
      lineHeight: 1.05,
      letterSpacing: '-3px',
      textWrap: 'balance'
    }
  }, "Plan the cycle. Ship the work."), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      maxWidth: 560,
      fontSize: 18,
      lineHeight: 1.5,
      letterSpacing: '-0.1px',
      color: 'var(--ink-subtle)'
    }
  }, "Docket is the issue tracker and kanban board for teams who would rather build than update tickets."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 10
    }
  }, /*#__PURE__*/React.createElement(Button, {
    size: "lg",
    onClick: () => go('Pricing')
  }, "Start building"), /*#__PURE__*/React.createElement(Button, {
    size: "lg",
    variant: "secondary",
    iconRight: "arrow-right",
    onClick: () => go('Changelog')
  }, "Read the changelog"))), /*#__PURE__*/React.createElement(Section, {
    style: {
      paddingBottom: 96
    }
  }, /*#__PURE__*/React.createElement(ProductShot, null)), /*#__PURE__*/React.createElement(Section, {
    style: {
      paddingBottom: 96,
      display: 'flex',
      flexDirection: 'column',
      gap: 32
    }
  }, /*#__PURE__*/React.createElement(Eyebrow, null, "Built for flow"), /*#__PURE__*/React.createElement("h2", {
    style: {
      margin: 0,
      maxWidth: 720,
      fontFamily: 'var(--font-display)',
      fontSize: 56,
      fontWeight: 600,
      lineHeight: 1.1,
      letterSpacing: '-1.8px'
    }
  }, "Every issue, in its place."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))',
      gap: 16
    }
  }, feats.map(([i, t, d]) => /*#__PURE__*/React.createElement(Card, {
    key: t,
    variant: "feature",
    interactive: true
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      color: 'var(--ink-subtle)',
      marginBottom: 32
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: i,
    size: 20
  })), /*#__PURE__*/React.createElement("h3", {
    style: {
      margin: 0,
      fontSize: 22,
      fontWeight: 500,
      letterSpacing: '-0.4px',
      lineHeight: 1.25
    }
  }, t), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '8px 0 0',
      fontSize: 14,
      lineHeight: 1.5,
      color: 'var(--ink-subtle)'
    }
  }, d))))), /*#__PURE__*/React.createElement(Section, {
    style: {
      paddingBottom: 96
    }
  }, /*#__PURE__*/React.createElement(Card, {
    variant: "testimonial",
    style: {
      maxWidth: 760
    }
  }, /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontSize: 22,
      lineHeight: 1.4,
      letterSpacing: '-0.3px'
    }
  }, "\u201CWe moved forty engineers onto Docket in a week. Standups got shorter because the board already said everything.\u201D"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      marginTop: 24
    }
  }, /*#__PURE__*/React.createElement(Avatar, {
    name: "Ines Varga",
    size: 36
  }), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 14,
      fontWeight: 500
    }
  }, "Ines Varga"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      color: 'var(--ink-subtle)'
    }
  }, "Head of Engineering"))))), /*#__PURE__*/React.createElement(Section, {
    style: {
      paddingBottom: 96
    }
  }, /*#__PURE__*/React.createElement(Card, {
    variant: "cta",
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 24,
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement("h2", {
    style: {
      margin: 0,
      fontFamily: 'var(--font-display)',
      fontSize: 28,
      fontWeight: 600,
      letterSpacing: '-0.6px'
    }
  }, "Start your first cycle today."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 10
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "secondary"
  }, "Talk to sales"), /*#__PURE__*/React.createElement(Button, {
    onClick: () => go('Pricing')
  }, "Get started")))));
}
Object.assign(window, {
  Section,
  Eyebrow,
  HomePage,
  ProductShot
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/website/Home.jsx", error: String((e && e.message) || e) }); }

// ui_kits/website/Pages.jsx
try { (() => {
function PricingPage() {
  const {
    Card,
    Button,
    Badge,
    SegmentedTabs,
    Icon
  } = window.DocketDesignSystem_e2ed17;
  const [period, setPeriod] = React.useState('Yearly');
  const y = period === 'Yearly';
  const tiers = [{
    name: 'Free',
    price: '$0',
    note: 'For small teams trying Docket',
    cta: 'Get started',
    v: 'pricing',
    bv: 'secondary',
    feats: ['Up to 250 issues', '2 teams', 'List and board views', 'Slack and GitHub']
  }, {
    name: 'Team',
    price: y ? '$8' : '$10',
    note: 'per seat / month',
    cta: 'Start trial',
    v: 'featured',
    bv: 'primary',
    badge: 'Popular',
    feats: ['Unlimited issues', 'Unlimited teams', 'Cycles and roadmaps', 'Board swimlanes', 'Guest access']
  }, {
    name: 'Business',
    price: y ? '$14' : '$16',
    note: 'per seat / month',
    cta: 'Talk to sales',
    v: 'pricing',
    bv: 'secondary',
    feats: ['Everything in Team', 'SAML SSO', 'Audit log', 'Private teams', 'Priority support']
  }];
  const rows = [['Issues', '250', 'Unlimited', 'Unlimited'], ['Cycles', '—', '✓', '✓'], ['Board swimlanes', '—', '✓', '✓'], ['SAML SSO', '—', '—', '✓'], ['Audit log', '—', '—', '✓']];
  return /*#__PURE__*/React.createElement(Section, {
    style: {
      padding: '96px 32px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 32
    }
  }, /*#__PURE__*/React.createElement("h1", {
    style: {
      margin: 0,
      fontFamily: 'var(--font-display)',
      fontSize: 56,
      fontWeight: 600,
      lineHeight: 1.1,
      letterSpacing: '-1.8px',
      textAlign: 'center'
    }
  }, "Pricing"), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontSize: 18,
      color: 'var(--ink-subtle)',
      textAlign: 'center'
    }
  }, "Start free. Upgrade when the team grows."), /*#__PURE__*/React.createElement(SegmentedTabs, {
    options: ['Monthly', 'Yearly'],
    value: period,
    onChange: setPeriod
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      width: '100%',
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))',
      gap: 16
    }
  }, tiers.map(t => /*#__PURE__*/React.createElement(Card, {
    key: t.name,
    variant: t.v,
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 20
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement("h3", {
    style: {
      margin: 0,
      fontSize: 28,
      fontWeight: 600,
      letterSpacing: '-0.6px'
    }
  }, t.name), t.badge && /*#__PURE__*/React.createElement(Badge, {
    tone: "primary"
  }, t.badge)), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-display)',
      fontSize: 40,
      fontWeight: 600,
      letterSpacing: '-1px'
    }
  }, t.price), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      color: 'var(--ink-subtle)'
    }
  }, t.note, y && t.name !== 'Free' ? ', billed yearly' : '')), /*#__PURE__*/React.createElement(Button, {
    variant: t.bv,
    fullWidth: true
  }, t.cta), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 10
    }
  }, t.feats.map(f => /*#__PURE__*/React.createElement("div", {
    key: f,
    style: {
      display: 'flex',
      gap: 8,
      alignItems: 'center',
      fontSize: 14,
      color: 'var(--ink-muted)'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "check",
    size: 14,
    color: "var(--ink-subtle)"
  }), f)))))), /*#__PURE__*/React.createElement("div", {
    style: {
      width: '100%',
      marginTop: 32
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '2fr 1fr 1fr 1fr',
      padding: '12px 0',
      borderBottom: '1px solid var(--hairline-strong)',
      fontSize: 14,
      fontWeight: 500
    }
  }, /*#__PURE__*/React.createElement("span", null, "Compare plans"), /*#__PURE__*/React.createElement("span", null, "Free"), /*#__PURE__*/React.createElement("span", null, "Team"), /*#__PURE__*/React.createElement("span", null, "Business")), rows.map(r => /*#__PURE__*/React.createElement("div", {
    key: r[0],
    style: {
      display: 'grid',
      gridTemplateColumns: '2fr 1fr 1fr 1fr',
      padding: '12px 0',
      borderBottom: '1px solid var(--hairline)',
      fontSize: 14,
      color: 'var(--ink-muted)'
    }
  }, r.map((c, i) => /*#__PURE__*/React.createElement("span", {
    key: i,
    style: {
      color: i === 0 ? 'var(--ink)' : c === '—' ? 'var(--ink-tertiary)' : 'var(--ink-muted)'
    }
  }, c))))));
}
function ChangelogPage() {
  const {
    ChangelogRow,
    Badge
  } = window.DocketDesignSystem_e2ed17;
  const entries = [['Oct 21, 2026', 'v4.12', 'Board swimlanes', 'Group any board by assignee, project or label. Each swimlane collapses on its own and the state is saved per view.'], ['Oct 14, 2026', 'v4.11', 'Cycle burn-up chart', 'The cycle page now shows scope and completed work as two lines, so added scope no longer hides progress.'], ['Oct 07, 2026', 'v4.10', 'Faster issue lists', 'Grouped lists with thousands of rows now scroll at a steady frame rate. Filters apply without a reload.'], ['Sep 30, 2026', 'v4.9', 'Signed attachment URLs', 'Attachments are served from short-lived signed URLs. Existing links keep working for workspace members.']];
  return /*#__PURE__*/React.createElement(Section, {
    style: {
      padding: '96px 32px',
      maxWidth: 920
    }
  }, /*#__PURE__*/React.createElement(Eyebrow, null, "Changelog"), /*#__PURE__*/React.createElement("h1", {
    style: {
      margin: '12px 0 8px',
      fontFamily: 'var(--font-display)',
      fontSize: 56,
      fontWeight: 600,
      lineHeight: 1.1,
      letterSpacing: '-1.8px'
    }
  }, "What's new in Docket"), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '0 0 40px',
      fontSize: 18,
      color: 'var(--ink-subtle)'
    }
  }, "Product updates, shipped weekly."), /*#__PURE__*/React.createElement("div", {
    style: {
      borderTop: '1px solid var(--hairline)'
    }
  }, entries.map(([d, v, t, b], i) => /*#__PURE__*/React.createElement(ChangelogRow, {
    key: v,
    date: d,
    version: v,
    title: t
  }, i === 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      marginBottom: 8
    }
  }, /*#__PURE__*/React.createElement(Badge, {
    tone: "primary"
  }, "Latest")), b))));
}
Object.assign(window, {
  PricingPage,
  ChangelogPage
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/website/Pages.jsx", error: String((e && e.message) || e) }); }

__ds_ns.Avatar = __ds_scope.Avatar;

__ds_ns.Badge = __ds_scope.Badge;

__ds_ns.Button = __ds_scope.Button;

__ds_ns.Icon = __ds_scope.Icon;

__ds_ns.IconButton = __ds_scope.IconButton;

__ds_ns.Kbd = __ds_scope.Kbd;

__ds_ns.Tag = __ds_scope.Tag;

__ds_ns.ICONS = __ds_scope.ICONS;

__ds_ns.SegmentedTabs = __ds_scope.SegmentedTabs;

__ds_ns.TextInput = __ds_scope.TextInput;

__ds_ns.BoardColumn = __ds_scope.BoardColumn;

__ds_ns.IssueRow = __ds_scope.IssueRow;

__ds_ns.KanbanCard = __ds_scope.KanbanCard;

__ds_ns.PRIORITY = __ds_scope.PRIORITY;

__ds_ns.PriorityIcon = __ds_scope.PriorityIcon;

__ds_ns.STATUS = __ds_scope.STATUS;

__ds_ns.StatusIcon = __ds_scope.StatusIcon;

__ds_ns.Footer = __ds_scope.Footer;

__ds_ns.SidebarItem = __ds_scope.SidebarItem;

__ds_ns.TopNav = __ds_scope.TopNav;

__ds_ns.Card = __ds_scope.Card;

__ds_ns.ChangelogRow = __ds_scope.ChangelogRow;

__ds_ns.Menu = __ds_scope.Menu;

})();

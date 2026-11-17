# Search Overlay

سرچ VS Code را به شکل یک باکس شناور وسط صفحه باز می‌کند، با ظاهر PhpStorm/Darcula.
هیچ الگوریتم سرچی از صفر نوشته نشده: فایل‌ها با `workspace.findFiles`، سیمبل‌ها با
`executeWorkspaceSymbolProvider`، دستورها با `commands.getCommands` و متن با همان
موتور `ripgrep` که خود VS Code استفاده می‌کند.

![preview](media/preview.png)

## استفاده

`Ctrl+Alt+Shift+F` → باکس باز می‌شود → تایپ کن → `Enter` فایل را روی همان خط باز می‌کند.

| کلید | کار |
| --- | --- |
| `↑` `↓` / `PageUp` `PageDown` | حرکت در نتایج |
| `Enter` | باز کردن نتیجه (فایل/سیمبل → ادیتور روی خط، Action → اجرا) |
| `Alt+Enter` | همان query را در Search Editor نیتیو VS Code باز کن |
| `Tab` / `Shift+Tab` | عوض کردن تب (All / Files / Text / Symbols / Actions) |
| `Esc` | بستن |

## دستورها

| Command ID | کار |
| --- | --- |
| `vsSearch.search` | اورلی (با توجه به `vsSearch.ui`) |
| `vsSearch.overlay` | مستقیم حالت PhpStorm |
| `vsSearch.quickPick` | حالت QuickPick نیتیو |
| `vsSearch.searchSelection` | اورلی با متن انتخاب‌شده |
| `vsSearch.searchToSide` | فرستادن query به Search Editor کنار ادیتور |
| `vsSearch.close` | بستن اورلی |
| `vsSearch.clearHistory` | پاک کردن تاریخچه |

عوض کردن کلید: `Ctrl+K Ctrl+S` → `vsSearch.search` → هر ترکیبی که خواستی. یا در `keybindings.json`:

```json
{ "key": "ctrl+shift+alt+f", "command": "vsSearch.search" }
```

## تنظیمات

| Setting | Default | کار |
| --- | --- | --- |
| `vsSearch.ui` | `overlay` | `overlay` = باکس شناور PhpStorm، `quickpick` = QuickPick نیتیو |
| `vsSearch.theme` | `phpstorm` | `phpstorm` = پالت Darcula، `vscode` = رنگ‌های تم فعلی VS Code |
| `vsSearch.maxResults` | `30` | سقف نتیجه برای هر منبع |
| `vsSearch.target` | `searchEditor` | مقصد `searchToSide` / `Alt+Enter` (`searchEditor` یا `sidebarPanel`) |
| `vsSearch.reuseSearchEditor` | `true` | استفاده مجدد از تب Search Editor |
| `vsSearch.showIncludesExcludes` | `false` | نمایش فیلد include/exclude در Search Editor |
| `vsSearch.title` | `Search Everywhere` | تیتر حالت QuickPick |
| `vsSearch.historyLimit` | `25` | تعداد queryهای اخیر در حالت QuickPick |

## نصب و بیلد

```bash
npm install
npm run compile
npm run package                       # vs-search-overlay-0.2.0.vsix
code --install-extension vs-search-overlay-0.2.0.vsix
```

بعد از نصب پنجره VS Code را reload کن. برای دیباگ: پوشه را باز کن و `F5` بزن.

## ساختار

```
src/extension.ts   ثبت commandها و انتخاب UI
src/overlay.ts     WebviewPanel + پروتکل پیام با UI
src/search.ts      providers: files / text (ripgrep) / symbols / commands
src/native.ts      فرستادن query به Search Editor نیتیو
src/quickpick.ts   حالت QuickPick
media/             HTML/CSS/JS داخل webview
```

## محدودیت‌ها

- Webview در VS Code نمی‌تواند روی کل پنجره (سایدبار + پنل) شناور شود؛ اورلی روی ناحیه ادیتور
  رندر می‌شود. برای همین وقتی تب عوض شود خودش بسته می‌شود تا حس modal بدهد.
- اگر `rg` روی سیستم نباشد، جست‌وجوی متن به اسکن فایل‌ها با API خود VS Code سقوط می‌کند (کندتر).
- جست‌وجوی متن literal است (مثل حالت پیش‌فرض PhpStorm). برای regex از `Alt+Enter` و Search Editor استفاده کن.

# Search Everywhere

سرچ VS Code در یک تب معمولی، با فیلتر مسیر و نوع فایل. موتور سرچ نیتیو می‌ماند
(`findFiles`، workspace symbols، command registry و همان `ripgrep` که VS Code استفاده می‌کند).

![page](media/preview.png)

یک آیکون هم بالا-راست پنجره (کنار تب‌ها، مثل Claude Code) اضافه می‌شود که تب سرچ را باز می‌کند.

## استفاده

- **آیکون بالا-راست** یا `Ctrl+Alt+Shift+F` → تب سرچ باز می‌شود
- تایپ کن → نتایج زنده در بخش‌های `Files` / `Text occurrences` / `Symbols` / `Commands`
- `Enter` → فایل روی همان خط باز می‌شود (تب سرچ باز می‌ماند)
- `Alt+Enter` → همان query در Search Editor نیتیو VS Code (با همان فیلترها)
- `Esc` → بستن تب

| کلید | کار |
| --- | --- |
| `↑` `↓` / `PageUp` `PageDown` | حرکت در نتایج |
| `Tab` / `Shift+Tab` | عوض کردن تب نتایج |

## دو فیلتر جدید

1. **مسیر (Scope)** — بالای سرچ، دکمهٔ کنار آیکون پوشه: `Everywhere` یا هر پوشه از workspace. سرچ فقط در همان مسیر انجام می‌شود (هم Files، هم Text، هم Symbols).
2. **نوع فایل** — باکس `File types`: مثلاً `ts, js, md` یا `*.py`. هم لیست فایل‌ها و هم متن فقط در همان پسوندها جست‌وجو می‌شود.

هر دو فیلتر به `Alt+Enter` هم می‌رسند (Search Editor با include همان scope/types باز می‌شود).

## دستورها

| Command ID | کار |
| --- | --- |
| `vsSearch.search` | باز کردن تب سرچ (آیکون بالا-راست هم همین است) |
| `vsSearch.searchSelection` | با متن انتخاب‌شده |
| `vsSearch.searchToSide` | Search Editor نیتیو کنار ادیتور |
| `vsSearch.close` | بستن تب سرچ |

عوض کردن کلید: `Ctrl+K Ctrl+S` → `vsSearch.search`. یا در `keybindings.json`:

```json
{ "key": "ctrl+shift+alt+f", "command": "vsSearch.search" }
```

## تنظیمات

| Setting | Default | کار |
| --- | --- | --- |
| `vsSearch.theme` | `phpstorm` | `phpstorm` = پالت Darcula · `vscode` = رنگ‌های تم فعلی |
| `vsSearch.maxResults` | `30` | سقف نتیجه هر منبع |
| `vsSearch.target` | `searchEditor` | مقصد `searchToSide` / `Alt+Enter` |
| `vsSearch.reuseSearchEditor` | `true` | استفاده مجدد از تب Search Editor |
| `vsSearch.showIncludesExcludes` | `false` | نمایش فیلد include/exclude در Search Editor |

## اپ دسکتاپ (اختیاری)

همان UI به شکل پنجره‌ی مستقل وسط صفحه، روی همه چیز:

```bash
cd desktop && npm install && ./run.sh
```

![desktop](media/preview-desktop.png)

- با یک shortcut سراسری صدا زده می‌شود (KDE: System Settings → Shortcuts → Custom → Command = `…/desktop/run.sh`)
- اگر باز است → می‌بندد، اگر بسته است → باز می‌کند (single-instance toggle)
- فولدرهای workspace را از `~/.config/vs-search/workspace.json` می‌خواند (افزونه خودش آن را می‌نویسد)
- `Enter` → `code -g path:line:col` در همان پنجرهٔ VS Code
- با `--ozone-platform=x11` اجرا می‌شود چون Wayland موقعیت پنجره نمی‌دهد

## نصب و بیلد افزونه

```bash
npm install
npm run compile
npm run package                       # vs-search-overlay-0.6.0.vsix
code --install-extension vs-search-overlay-0.6.0.vsix
```

بعد از نصب پنجره VS Code را reload کن. برای دیباگ: پوشه را باز کن و `F5` بزن.

## ساختار

```
media/overlay.html  قالب مشترک UI (تب VS Code + اپ دسکتاپ)
media/overlay.js    منطق UI: تایپ، تب‌ها، scope، file types، رندر
media/overlay.css   ظاهر PhpStorm/Darcula
src/page.ts         تب سرچ (webview) + پروتکل پیام
src/search.ts       providers: files / text (ripgrep) / symbols / commands
src/native.ts       فرستادن query به Search Editor نیتیو
src/extension.ts    commandها، آیکون editor/title، سینک workspace برای اپ دسکتاپ
desktop/            اپ دسکتاپ (Electron)
```

## محدودیت‌ها

- جست‌وجوی متن literal است (مثل پیش‌فرض PhpStorm). regex → `searchToSide` یا `Alt+Enter`.
- اگر `rg` نباشد، متن با `workspace.fs` اسکن می‌شود (کندتر).
- اپ دسکتاپ symbol/command ندارد.

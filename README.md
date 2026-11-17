# Scanline

**Scanline** — search files, text, symbols and commands from one editor tab, with folder-scope and file-type filters. The native engine stays in charge (`findFiles`, workspace symbols, the command registry, and the same `ripgrep` VS Code uses).

- One shortcut opens a half-screen search tab next to the current editor
- A scope picker (workspace, direct sub-folders, or Browse…) and a `File types` box (`ts, js, md` or `*.py`)
- Live results in `Files` / `Text occurrences` / `Symbols` / `Commands` sections
- `Enter` opens the hit in the main editor and keeps the search tab; `Alt+Enter` sends the same query (with the same filters) to the native Search Editor
- `Esc` closes the tab

Install from the Marketplace, then reload VS Code. Default shortcut: `Ctrl+Alt+Shift+F` (`Cmd+Alt+Shift+F` on macOS).

---

نسخهٔ فارسی همین توضیحات:

## نسخهٔ فارسی

سرچ VS Code در یک تب معمولی، با فیلتر مسیر و نوع فایل. موتور سرچ نیتیو می‌ماند
(`findFiles`، workspace symbols، command registry و همان `ripgrep` که VS Code استفاده می‌کند).

![page](media/preview.png)

یک آیکون هم بالا-راست پنجره (کنار تب‌ها، مثل Claude Code) اضافه می‌شود که تب سرچ را باز می‌کند.

## استفاده

- **آیکون بالا-راست** یا `Ctrl+Alt+Shift+F` → تب سرچ **کنار ادیتور فعلی، نصف صفحه** باز می‌شود (مثل Claude Code)
- **راست‌کلیک روی هر پوشه در Explorer → `Search in This Folder`** → همان تب با scope همان پوشه (مسیر از قبل انتخاب‌شده است)
- تایپ کن → نتایج زنده در بخش‌های `Files` / `Text occurrences` / `Symbols` / `Commands`
- `Enter` → فایل در ادیتور اصلی (ستون اول) باز می‌شود و **تب سرچ سر جایش می‌ماند**
- `Alt+Enter` → همان query در Search Editor نیتیو VS Code (با همان فیلترها)
- `Esc` → بستن تب

| کلید | کار |
| --- | --- |
| `↑` `↓` / `PageUp` `PageDown` | حرکت در نتایج |
| `Tab` / `Shift+Tab` | عوض کردن تب نتایج |

## دو فیلتر

1. **مسیر (Scope)** — دکمهٔ کنار آیکون پوشه: `Everywhere`، ریشه‌ی workspace، یا **زیرپوشه‌های مستقیم** آن (مثلاً `scanline/src`). آخرین گزینه `Browse…` است که با دیالوگ نیتیو هر پوشه‌ای را انتخاب می‌کند. سرچ فقط در همان مسیر انجام می‌شود (Files + Text + Symbols).
2. **نوع فایل** — باکس `File types`: مثلاً `ts, js, md` یا `*.py`. هم لیست فایل‌ها و هم متن فقط در همان پسوندها جست‌وجو می‌شود.

هر دو فیلتر به `Alt+Enter` هم می‌رسند (Search Editor با include همان scope/types باز می‌شود).

## دستورها

| Command ID | کار |
| --- | --- |
| `scanline.search` | باز کردن تب سرچ (آیکون بالا-راست هم همین است) |
| `scanline.searchSelection` | با متن انتخاب‌شده |
| `scanline.searchInFolder` | راست‌کلیک روی پوشه در Explorer → تب سرچ با scope همان پوشه |
| `scanline.searchToSide` | Search Editor نیتیو کنار ادیتور |
| `scanline.close` | بستن تب سرچ |

عوض کردن کلید: `Ctrl+K Ctrl+S` → `scanline.search`. یا در `keybindings.json`:

```json
{ "key": "ctrl+shift+alt+f", "command": "scanline.search" }
```

## تنظیمات

| Setting | Default | کار |
| --- | --- | --- |
| `scanline.theme` | `phpstorm` | `phpstorm` = پالت Darcula · `vscode` = رنگ‌های تم فعلی |
| `scanline.maxResults` | `30` | سقف نتیجه هر منبع |
| `scanline.target` | `searchEditor` | مقصد `searchToSide` / `Alt+Enter` |
| `scanline.reuseSearchEditor` | `true` | استفاده مجدد از تب Search Editor |
| `scanline.showIncludesExcludes` | `false` | نمایش فیلد include/exclude در Search Editor |

## اپ دسکتاپ (اختیاری)

همان UI به شکل پنجره‌ی مستقل وسط صفحه، روی همه چیز:

```bash
cd desktop && npm install && ./run.sh
```

![desktop](media/preview-desktop.png)

- با یک shortcut سراسری صدا زده می‌شود (KDE: System Settings → Shortcuts → Custom → Command = `…/desktop/run.sh`)
- اگر باز است → می‌بندد، اگر بسته است → باز می‌کند (single-instance toggle)
- فولدرهای workspace را از `~/.config/scanline/workspace.json` می‌خواند (افزونه خودش آن را می‌نویسد)
- `Enter` → `code -g path:line:col` در همان پنجرهٔ VS Code
- با `--ozone-platform=x11` اجرا می‌شود چون Wayland موقعیت پنجره نمی‌دهد

## نصب و بیلد افزونه

```bash
npm install
npm run compile
npm run package                       # scanline-0.7.0.vsix
code --install-extension scanline-0.7.0.vsix
```

بعد از نصب پنجره VS Code را reload کن. برای دیباگ: پوشه را باز کن و `F5` بزن.

## انتشار (Publish)

```bash
npx vsce login <publisher-id>         # یک‌بار
npm run publish                       # یا: npx vsce publish minor
```

یا push یک tag (`v0.7.1`) تا ورک‌فلو `.github/workflows/publish.yml` با
Trusted Publishing (OIDC) و بدون PAT منتشر کند.

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

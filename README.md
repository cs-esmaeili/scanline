# Search Overlay

سه چیز در این ریپو هست:

| بخش | چیست |
| --- | --- |
| `desktop/` | **اورلی واقعی دسکتاپ** — پنجره‌ی بی‌قاب، همیشه روی همه چیز، دقیقاً وسط صفحه، با hotkey سراسری. نتیجه را با `code -g` در VS Code باز می‌کند. |
| `src/` + `media/` | افزونه VS Code با سه حالت (QuickPick / اورلی وب‌ویو / تب تمام‌صفحه) |
| `media/` | UI مشترک هر دو (یک HTML/CSS/JS برای webview و اپ دسکتاپ) |

![desktop overlay](media/preview-desktop.png)

## ۱) اورلی دسکتاپ

پنجره‌ای ۸۲۰×۴۸۰، بدون قاب، `alwaysOnTop`، وسط مانیتوری که موس رویش است.
با `Esc` یا کلیک بیرون بسته می‌شود؛ دکمه‌ی hotkey دوباره بازش می‌کند.

```bash
cd desktop
npm install
./run.sh          # تست دستی
```

بعد یک shortcut سراسری بساز:

- **KDE**: System Settings → Shortcuts → Custom → *Add New → Command or Script*
  - Command: `/home/javad/dev/vs-search/desktop/run.sh`
  - Trigger: مثلاً `Meta+Shift+F`
- **GNOME**: Settings → Keyboard → Custom Shortcuts → `+`

هر بار زدن hotkey: اگر پنجره باز است → بسته می‌شود، اگر بسته است → باز می‌شود
(single-instance lock + toggle).

### کدام فولدر سرچ شود؟

افزونه VS Code هنگام فعال شدن، ریشه‌ی workspaceها را در
`~/.config/vs-search/workspace.json` می‌نویسد و اپ دسکتاپ همان را می‌خواند.
بدون آن، `$VS_SEARCH_ROOT` یا `$HOME` استفاده می‌شود.

### چه چیزی سرچ می‌شود؟

- **Files** — `rg --files` + fuzzy rank روی نام فایل
- **Text** — `rg --json`، literal + smart-case، همان موتوری که VS Code استفاده می‌کند
- Symbols و Commands در اپ دسکتاپ نیستند (به language server و registry خود VS Code نیاز دارند)

`Enter` روی نتیجه → `code -g path:line:col` → فایل در پنجره‌ی باز VS Code باز می‌شود.

### نکته‌ی Wayland

Wayland اجازه‌ی تعیین موقعیت پنجره نمی‌دهد؛ برای همین `run.sh` با
`--ozone-platform=x11` (XWayland) اجرا می‌شود تا «وسط صفحه» و «همیشه روی همه» واقعاً کار کند.

## ۲) افزونه VS Code

![overlay](media/preview.png)

| حالت (`vsSearch.presentation`) | تب ادیتور | ظاهر |
| --- | --- | --- |
| `quickpick` (پیش‌فرض) | **هیچ** | QuickPick نیتیو، بالای پنجره |
| `overlay` | تب موقت | باکس شناور PhpStorm روی ناحیه ادیتور |
| `page` | تب دائمی | همان UI تمام‌صفحه در تب |

> هر `WebviewPanel` در VS Code الزاماً یک تب است؛ امکان پنل شناور روی کل پنجره
> وجود ندارد. برای «روی همه چیز، وسط صفحه» از اپ `desktop/` استفاده کن.

### دستورها

| Command ID | کار |
| --- | --- |
| `vsSearch.search` | با توجه به `vsSearch.presentation` |
| `vsSearch.quickPick` | حالت بدون تب |
| `vsSearch.overlay` | باکس شناور |
| `vsSearch.page` | تب تمام‌صفحه |
| `vsSearch.searchSelection` | با متن انتخاب‌شده |
| `vsSearch.searchToSide` | Search Editor نیتیو |
| `vsSearch.close` | بستن |

کلید پیش‌فرض: `Ctrl+Alt+Shift+F` (قابل تغییر در `Ctrl+K Ctrl+S` یا `keybindings.json`).

### تنظیمات

| Setting | Default | کار |
| --- | --- | --- |
| `vsSearch.presentation` | `quickpick` | `quickpick` / `overlay` / `page` |
| `vsSearch.theme` | `phpstorm` | پالت حالت‌های webview |
| `vsSearch.maxResults` | `30` | سقف نتیجه هر منبع |
| `vsSearch.title` | `Search Everywhere` | تیتر |
| `vsSearch.target` | `searchEditor` | مقصد `searchToSide` |
| `vsSearch.reuseSearchEditor` | `true` | استفاده مجدد از تب Search Editor |
| `vsSearch.showIncludesExcludes` | `false` | فیلد include/exclude در Search Editor |

### نصب افزونه

```bash
npm install
npm run compile
npm run package                       # vs-search-overlay-0.5.0.vsix
code --install-extension vs-search-overlay-0.5.0.vsix
```

## ساختار

```
desktop/main.js     پنجره‌ی دسکتاپ، IPC، hotkey toggle، `code -g`
desktop/search.js   providers برای اپ دسکتاپ (rg)
desktop/preload.js  پل بین UI و Electron
media/overlay.html  قالب مشترک UI (webview + desktop)
media/overlay.js    منطق UI (تایپ، تب، کیبورد، رندر نتایج)
media/overlay.css   ظاهر PhpStorm/Darcula
src/extension.ts    commandها + سینک ریشه‌ی workspace برای اپ دسکتاپ
src/nativeQuickPick.ts  حالت بدون تب داخل VS Code
src/overlay.ts      webview برای overlay / page
src/search.ts       providers داخل VS Code
src/native.ts       فرستادن query به Search Editor
```

## محدودیت‌ها

- جست‌وجوی متن literal است (مثل پیش‌فرض PhpStorm). regex → `searchToSide`.
- اگر `rg` نباشد، افزونه به اسکن با `workspace.fs` سقوط می‌کند؛ اپ دسکتاپ به `rg` نیاز دارد.
- اپ دسکتاپ symbol/command ندارد.

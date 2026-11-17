# Search Overlay

سرچ VS Code را به شکل یک اورلی وسط صفحه باز می‌کند. سه حالت نمایش دارد و پیش‌فرض
`quickpick` است: **بدون تب**، هرجا که هستی روی صفحه باز می‌شود.

| حالت (`vsSearch.presentation`) | تب ادیتور | ظاهر |
| --- | --- | --- |
| `quickpick` (پیش‌فرض) | **هیچ** | QuickPick نیتیو، وسط صفحه، با نتایج زنده |
| `overlay` | تب موقت (خودکار بسته می‌شود) | باکس شناور PhpStorm روی ناحیه ادیتور |
| `page` | تب دائمی | همان UI تمام‌صفحه داخل تب |

> محدودیت پلتفرم: هر `WebviewPanel` در VS Code الزاماً یک تب ادیتور است؛ امکان
> ساختن پنل شناور روی کل پنجره وجود ندارد. برای همین حالت پیش‌فرض QuickPick است:
> کامپوننت نیتیو که واقعاً روی پنجره باز می‌شود و هیچ تبی نمی‌سازد.

## حالت‌ها

**`quickpick` — بدون تب، همه‌جا**

- تایپ کن → نتایج زنده در بخش‌های `Files` / `Text occurrences` / `Symbols` / `Commands`
- `Enter` روی نتیجه → فایل روی همان خط باز می‌شود
- `Enter` بدون نتیجه → Search Editor نیتیو VS Code با همان query باز می‌شود
- `Esc` → بستن

**`overlay` — باکس شناور PhpStorm** (تب موقت، با رفتن فوکوس خودکار حذف می‌شود)

![overlay](media/preview.png)

**`page` — همان UI در یک تب معمولی** (باز می‌ماند، برای مرور طولانی نتایج)

![page](media/preview-page.png)

## استفاده

`Ctrl+Alt+Shift+F` → سرچ باز می‌شود → تایپ کن → `Enter`.

در حالت‌های webview:

| کلید | کار |
| --- | --- |
| `↑` `↓` / `PageUp` `PageDown` | حرکت در نتایج |
| `Enter` | باز کردن نتیجه (Action → اجرا) |
| `Alt+Enter` | همان query در Search Editor نیتیو |
| `Tab` / `Shift+Tab` | عوض کردن تب |
| `Esc` | بستن |

## دستورها

| Command ID | کار |
| --- | --- |
| `vsSearch.search` | با توجه به `vsSearch.presentation` |
| `vsSearch.quickPick` | همیشه حالت بدون تب |
| `vsSearch.overlay` | همیشه باکس شناور |
| `vsSearch.page` | همیشه تب تمام‌صفحه |
| `vsSearch.searchSelection` | همان `vsSearch.search` با متن انتخاب‌شده |
| `vsSearch.searchToSide` | فرستادن query به Search Editor کنار ادیتور |
| `vsSearch.close` | بستن باکس webview |

عوض کردن کلید: `Ctrl+K Ctrl+S` → `vsSearch.search` → هر ترکیبی که خواستی. یا در `keybindings.json`:

```json
{ "key": "ctrl+shift+alt+f", "command": "vsSearch.search" }
```

## منبع نتایج

هیچ الگوریتم سرچی از صفر نوشته نشده:

| بخش | منبع |
| --- | --- |
| Files | `workspace.findFiles` + fuzzy rank |
| Text | همان `rg` (ripgrep) که VS Code استفاده می‌کند، literal + smart-case |
| Symbols | `executeWorkspaceSymbolProvider` (خود language servers) |
| Commands | `commands.getCommands` |

اگر `rg` روی سیستم نباشد، جست‌وجوی متن به اسکن فایل با `workspace.fs` سقوط می‌کند (کندتر).

## تنظیمات

| Setting | Default | کار |
| --- | --- | --- |
| `vsSearch.presentation` | `quickpick` | `quickpick` = بدون تب · `overlay` = باکس شناور · `page` = تب تمام‌صفحه |
| `vsSearch.theme` | `phpstorm` | پالت حالت‌های webview: `phpstorm` (Darcula) یا `vscode` |
| `vsSearch.maxResults` | `30` | سقف نتیجه هر منبع (در حالت quickpick حداکثر ۱۵) |
| `vsSearch.title` | `Search Everywhere` | تیتر اورلی |
| `vsSearch.target` | `searchEditor` | مقصد `searchToSide` (`searchEditor` یا `sidebarPanel`) |
| `vsSearch.reuseSearchEditor` | `true` | استفاده مجدد از تب Search Editor |
| `vsSearch.showIncludesExcludes` | `false` | نمایش فیلد include/exclude در Search Editor |

## نصب و بیلد

```bash
npm install
npm run compile
npm run package                       # vs-search-overlay-0.4.0.vsix
code --install-extension vs-search-overlay-0.4.0.vsix
```

بعد از نصب پنجره VS Code را reload کن. برای دیباگ: پوشه را باز کن و `F5` بزن.

## ساختار

```
src/extension.ts        ثبت commandها و انتخاب حالت
src/nativeQuickPick.ts  حالت بدون تب (QuickPick + نتایج زنده)
src/overlay.ts          WebviewPanel برای overlay / page
src/search.ts           providers: files / text (ripgrep) / symbols / commands
src/native.ts           فرستادن query به Search Editor نیتیو
media/                  HTML/CSS/JS داخل webview
```

## محدودیت‌ها

- حالت‌های webview نمی‌توانند روی کل پنجره (سایدبار + پنل) شناور شوند؛ محدودیت API است.
- جست‌وجوی متن literal است (مثل پیش‌فرض PhpStorm). برای regex از `searchToSide` یا `Alt+Enter` و Search Editor استفاده کن.
- در حالت `quickpick` فیلتر داخلی QuickPick خاموش است (`alwaysShow`) تا نتایج multi-word حذف نشوند.

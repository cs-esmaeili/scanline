# Search Overlay

سرچ VS Code را به‌جای سایدبار چپ، به شکل یک اورلی وسط صفحه باز می‌کند (حس PhpStorm).

**هیچ منطق سرچی نوشته نشده.** موتور سرچ، ریجکس، match-case، whole-word و نتیجه‌ها همه نیتیو خود VS Code هستند. این افزونه فقط UI را جابه‌جا می‌کند:

1. یک `QuickPick` نیتیو (که خود VS Code وسط-بالای پنجره رندر می‌کند) query را می‌گیرد.
2. با Enter، query را به **Search Editor** نیتیو VS Code می‌دهد (`search.action.openEditor`) که داخل ناحیه ادیتور باز می‌شود، نه سایدبار.

## دستورها

| Command ID | Title | کلید پیش‌فرض |
| --- | --- | --- |
| `vsSearch.search` | Search: Open Overlay (centered) | `Ctrl+Alt+Shift+F` / `Cmd+Alt+Shift+F` |
| `vsSearch.searchSelection` | Search: Open Overlay with Selection | `Ctrl+Alt+Shift+S` / `Cmd+Alt+Shift+S` |
| `vsSearch.searchToSide` | Search: Open Overlay to the Side | — |
| `vsSearch.clearHistory` | Search: Clear Overlay History | — |

کلید را عوض کردن: `Ctrl+K Ctrl+S` → جست‌وجوی `vsSearch.search` → دوبار کلیک → هر ترکیبی که خودت گفتی.

یا مستقیم در `keybindings.json`:

```json
{ "key": "ctrl+shift+alt+f", "command": "vsSearch.search" }
```

## تنظیمات

| Setting | Default | کار |
| --- | --- | --- |
| `vsSearch.title` | `Search Everywhere` | تیتر باکس ورودی |
| `vsSearch.target` | `searchEditor` | `searchEditor` = اورلی وسط + Search Editor، `sidebarPanel` = برگشت به سرچ سایدبار |
| `vsSearch.reuseSearchEditor` | `true` | استفاده مجدد از تب Search Editor موجود به‌جای باز کردن تب جدید |
| `vsSearch.showIncludesExcludes` | `false` | نمایش فیلدهای include/exclude در Search Editor |
| `vsSearch.historyLimit` | `25` | تعداد queryهای اخیر که در اورلی لیست می‌شوند |

## نصب

```bash
npm install
npm run compile
npm run package          # می‌سازد: vs-search-overlay-0.0.1.vsix
code --install-extension vs-search-overlay-0.0.1.vsix
```

بعد از نصب، پنجره‌های VS Code را reload کن.

برای توسعه/دیباگ: پوشه را در VS Code باز کن و `F5` بزن (launch config آماده است).

## محدودیت واقعیِ API

API افزونه‌های VS Code اجازه نمی‌دهد پنل نیتیو را "شناور" وسط صفحه جابه‌جا کنی. نزدیک‌ترین حالتِ بدون بازنویسی سرچ همین ترکیب است: ورودی نیتیو وسط + نتیجه‌های نیتیو داخل ادیتور. اگر باکس شناورِ کاملاً شبیه PhpStorm می‌خواهی، باید `WebviewPanel` بسازیم و سرچ را خودمان بزنیم — که دقیقاً همان چیزی است که گفتی نمی‌خواهی.

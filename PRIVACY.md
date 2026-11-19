# Privacy

Scanline runs entirely on your machine.

- No telemetry, analytics, crash reporting, or advertising.
- No network requests. Queries, file paths and results never leave your computer.
- Text search uses VS Code's own file APIs and, when available, the local `ripgrep` binary.
- Settings are stored by VS Code in the usual configuration and state locations.
- The extension does not read files outside the search scope you choose, except for the workspace folder list needed to build the scope picker.

## Optional desktop overlay

The separate desktop overlay in `desktop/` is not part of the published extension.

If you explicitly enable the `scanline.desktopSync` setting, the extension writes the current workspace folder paths to:

```
~/.config/scanline/workspace.json
```

That file is created with owner-only permissions (`0600`), is only written while the setting is enabled, and is used solely by the local desktop overlay. Disable the setting at any time; no file is written when it is off.

// @ts-nocheck
(function () {
  const vscode = acquireVsCodeApi();

  const ICONS = {
    file: '<path d="M3.6 1.9h5.1l3.7 3.7v8.5H3.6z"/><path d="M8.7 1.9v3.9h3.7"/>',
    text: '<path d="M2.6 3.6h10.8M2.6 8h10.8M2.6 12.4h6.8"/>',
    symbol: '<path d="M8 2.2l1.6 4.2L13.8 8l-4.2 1.6L8 13.8l-1.6-4.2L2.2 8l4.2-1.6z"/>',
    action: '<path d="M9.2 2.2L4.4 9.1h3l-1.1 4.7 5-7.1h-3z"/>',
    command: '<path d="M2.7 4.1l3 3.9-3 3.9M8.7 12.4h4.6"/>',
  };

  const TABS = [
    { id: 'all', label: 'All' },
    { id: 'files', label: 'Files' },
    { id: 'text', label: 'Text' },
    { id: 'symbols', label: 'Symbols' },
    { id: 'actions', label: 'Actions' },
  ];

  const state = {
    query: '',
    groups: { files: [], text: [], symbols: [], actions: [] },
    tab: 'all',
    sel: 0,
    busy: false,
  };

  const queryEl = document.getElementById('query');
  const tabsEl = document.getElementById('tabs');
  const resultsEl = document.getElementById('results');
  const statsEl = document.getElementById('stats');
  const spinnerEl = document.getElementById('spinner');

  function esc(value) {
    return String(value).replace(/[&<>"']/g, function (char) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char];
    });
  }

  function icon(kind) {
    const body = ICONS[kind] || ICONS.text;
    return (
      '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" ' +
      'stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round">' +
      body +
      '</svg>'
    );
  }

  function valuesOf(tab) {
    if (tab === 'all') {
      return state.groups.files
        .concat(state.groups.text)
        .concat(state.groups.symbols)
        .concat(state.groups.actions);
    }
    return state.groups[tab] || [];
  }

  function currentList() {
    return valuesOf(state.tab);
  }

  function totalCount() {
    return (
      state.groups.files.length +
      state.groups.text.length +
      state.groups.symbols.length +
      state.groups.actions.length
    );
  }

  function fallbackRanges(text, query) {
    if (!query) {
      return [];
    }
    const haystack = text.toLowerCase();
    const needle = query.toLowerCase();
    const ranges = [];
    let index = haystack.indexOf(needle);
    while (index >= 0) {
      ranges.push([index, index + needle.length]);
      index = haystack.indexOf(needle, index + needle.length);
    }
    return ranges;
  }

  function highlight(text, ranges, query) {
    const usable = (ranges && ranges.length ? ranges : fallbackRanges(text, query))
      .filter(function (range) {
        return range && range[1] > range[0];
      })
      .map(function (range) {
        return [Math.max(0, range[0]), Math.min(text.length, range[1])];
      })
      .sort(function (a, b) {
        return a[0] - b[0];
      });

    let html = '';
    let cursor = 0;
    for (let i = 0; i < usable.length; i++) {
      const start = usable[i][0];
      const end = usable[i][1];
      if (start < cursor) {
        continue;
      }
      html += esc(text.slice(cursor, start)) + '<mark>' + esc(text.slice(start, end)) + '</mark>';
      cursor = end;
    }
    return html + esc(text.slice(cursor));
  }

  function rowElement(item, index) {
    const row = document.createElement('div');
    row.className = 'row row-kind-' + item.kind + (index === state.sel ? ' selected' : '');
    row.dataset.index = String(index);
    row.innerHTML =
      '<span class="row-icon">' +
      icon(item.kind) +
      '</span><span class="label">' +
      highlight(item.label || '', item.match, state.query) +
      '</span><span class="detail">' +
      esc(item.detail || '') +
      '</span>';
    return row;
  }

  function renderTabs() {
    const visible = TABS.filter(function (tab) {
      return tab.id === 'all' || tab.id === state.tab || valuesOf(tab.id).length > 0;
    });
    tabsEl.innerHTML = visible
      .map(function (tab) {
        const count = tab.id === 'all' ? totalCount() : valuesOf(tab.id).length;
        return (
          '<div class="tab' +
          (tab.id === state.tab ? ' active' : '') +
          '" data-tab="' +
          tab.id +
          '">' +
          esc(tab.label) +
          (count > 0 ? '<span class="count">' + count + '</span>' : '') +
          '</div>'
        );
      })
      .join('');
  }

  function renderResults() {
    const list = currentList();
    resultsEl.innerHTML = '';

    if (!list.length) {
      const message = !state.query
        ? 'Search files, text, symbols and commands across the workspace'
        : state.busy
          ? 'Searching\u2026'
          : 'No results found for \u201c' + state.query + '\u201d';
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = message;
      resultsEl.appendChild(empty);
      return;
    }

    if (state.tab === 'all') {
      const order = [
        ['files', 'Files'],
        ['text', 'Text occurrences'],
        ['symbols', 'Symbols'],
        ['actions', 'Actions'],
      ];
      let index = 0;
      for (const entry of order) {
        const key = entry[0];
        const title = entry[1];
        if (!state.groups[key].length) {
          continue;
        }
        const header = document.createElement('div');
        header.className = 'group-header';
        header.textContent = title;
        resultsEl.appendChild(header);
        for (const item of state.groups[key]) {
          resultsEl.appendChild(rowElement(item, index++));
        }
      }
    } else {
      list.forEach(function (item, index) {
        resultsEl.appendChild(rowElement(item, index));
      });
    }

    const selected = resultsEl.querySelector('.row.selected');
    if (selected) {
      selected.scrollIntoView({ block: 'nearest' });
    }
  }

  function renderStats() {
    const list = currentList();
    const total = totalCount();
    statsEl.textContent = total === 0 ? '' : list.length === total ? total + ' results' : list.length + ' of ' + total;
  }

  function render() {
    renderTabs();
    renderResults();
    renderStats();
  }

  function clampSelection() {
    const length = currentList().length;
    if (!length) {
      state.sel = -1;
      return;
    }
    if (state.sel < 0) {
      state.sel = 0;
    }
    if (state.sel >= length) {
      state.sel = length - 1;
    }
  }

  function moveSelection(delta) {
    const length = currentList().length;
    if (!length) {
      return;
    }
    let next = state.sel + delta;
    if (next < 0) {
      next = delta < 0 ? 0 : 0;
    }
    if (next >= length) {
      next = length - 1;
    }
    if (next === state.sel) {
      return;
    }
    state.sel = next;
    const rows = resultsEl.querySelectorAll('.row');
    rows.forEach(function (row) {
      row.classList.toggle('selected', Number(row.dataset.index) === state.sel);
    });
    const selected = resultsEl.querySelector('.row.selected');
    if (selected) {
      selected.scrollIntoView({ block: 'nearest' });
    }
  }

  function cycleTab(direction) {
    const visible = TABS.filter(function (tab) {
      return tab.id === 'all' || valuesOf(tab.id).length > 0;
    });
    let index = visible.findIndex(function (tab) {
      return tab.id === state.tab;
    });
    if (index < 0) {
      index = 0;
    }
    index = (index + direction + visible.length) % visible.length;
    state.tab = visible[index].id;
    state.sel = 0;
    render();
  }

  function accept(alt) {
    const item = currentList()[state.sel];
    if (!item) {
      return;
    }
    vscode.postMessage({ type: 'accept', item: item, alt: !!alt });
  }

  function setActiveTab(tab) {
    if (state.tab === tab) {
      return;
    }
    state.tab = tab;
    state.sel = 0;
    render();
    queryEl.focus();
  }

  // ------------------------------------------------------------- events

  let queryTimer;
  queryEl.addEventListener('input', function () {
    state.query = queryEl.value;
    clearTimeout(queryTimer);
    queryTimer = setTimeout(function () {
      vscode.postMessage({ type: 'query', value: state.query });
    }, 110);
  });

  document.addEventListener('keydown', function (event) {
    switch (event.key) {
      case 'Escape':
        event.preventDefault();
        vscode.postMessage({ type: 'close' });
        break;
      case 'ArrowDown':
        event.preventDefault();
        moveSelection(1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        moveSelection(-1);
        break;
      case 'PageDown':
        event.preventDefault();
        moveSelection(10);
        break;
      case 'PageUp':
        event.preventDefault();
        moveSelection(-10);
        break;
      case 'Tab':
        event.preventDefault();
        cycleTab(event.shiftKey ? -1 : 1);
        break;
      case 'Enter':
        event.preventDefault();
        accept(event.altKey);
        break;
      default:
        break;
    }
  });

  tabsEl.addEventListener('mousedown', function (event) {
    const target = event.target.closest('.tab');
    if (target) {
      event.preventDefault();
      setActiveTab(target.dataset.tab);
    }
  });

  resultsEl.addEventListener('mouseover', function (event) {
    const target = event.target.closest('.row');
    if (!target) {
      return;
    }
    const index = Number(target.dataset.index);
    if (index === state.sel) {
      return;
    }
    state.sel = index;
    resultsEl.querySelectorAll('.row').forEach(function (row) {
      row.classList.toggle('selected', Number(row.dataset.index) === state.sel);
    });
  });

  resultsEl.addEventListener('mousedown', function (event) {
    const target = event.target.closest('.row');
    if (!target) {
      return;
    }
    event.preventDefault();
    state.sel = Number(target.dataset.index);
    accept(event.altKey);
  });

  document.querySelector('.backdrop').addEventListener('mousedown', function (event) {
    if (event.target === event.currentTarget) {
      vscode.postMessage({ type: 'close' });
    }
  });

  window.addEventListener('message', function (event) {
    const message = event.data;
    if (!message || !message.type) {
      return;
    }

    if (message.type === 'init') {
      if (message.theme) {
        document.body.dataset.theme = message.theme;
      }
      state.tab = message.tab || 'all';
      if (message.initial) {
        queryEl.value = message.initial;
        state.query = message.initial;
        vscode.postMessage({ type: 'query', value: message.initial });
      }
      queryEl.focus();
      if (queryEl.value) {
        queryEl.select();
      }
      render();
      return;
    }

    if (message.type === 'busy') {
      state.busy = !!message.value;
      spinnerEl.classList.toggle('busy', state.busy);
      if (!currentList().length) {
        renderResults();
      }
      return;
    }

    if (message.type === 'results') {
      state.busy = false;
      spinnerEl.classList.remove('busy');
      state.groups = message.groups || { files: [], text: [], symbols: [], actions: [] };
      if (state.tab !== 'all' && !valuesOf(state.tab).length) {
        state.tab = 'all';
      }
      state.sel = 0;
      clampSelection();
      render();
      return;
    }

    if (message.type === 'focus') {
      queryEl.focus();
      queryEl.select();
    }
  });

  queryEl.focus();
  render();
  vscode.postMessage({ type: 'ready' });
})();

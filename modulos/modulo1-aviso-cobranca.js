/*!
 * SmartTable — Power BI-style data table (vanilla JS port).
 *
 * Sort headers, per-column funnel filters with searchable checkbox list,
 * proportional data bars, totals row, optional global search, sticky header.
 *
 * Uso:
 *   const t = new SmartTable(container, {
 *     columns: [
 *       { key: 'matricula', label: 'Matrícula', mono: true, type: 'number', total: false },
 *       { key: 'nome',      label: 'Nome' },
 *       { key: 'salario',   label: 'Salário', type: 'number', dataBar: true, format: fmtBRL },
 *       { key: 'faixa',     label: 'Faixa', align: 'center', render: (v) => badge(v) },
 *     ],
 *     rows: [],
 *     searchable: true,
 *     totals: true,
 *     initialSort: { key: 'nome', dir: 'asc' },
 *     onRowClick: (row) => openDetail(row.id),
 *     emptyText: 'Nada encontrado.',
 *     loadingText: 'Carregando…',
 *     maxHeight: 'calc(100vh - 400px)'
 *   });
 *   t.setRows(newRows);
 *   t.setLoading(true);
 *   t.destroy();
 *
 * Depende de smart-table.css e de tokens CSS (--yellow-400, --text-heading, etc.)
 * que devem existir no escopo do container (ex.: .pbi-scope).
 */
(function (global) {
    'use strict';

    // ---------- Constantes ----------

    var ARROW_UP   = 'M12 5l6 7H6z';
    var ARROW_DOWN = 'M12 19l-6-7h12z';
    var FUNNEL     = 'M22 3H2l8 9.46V19l4 2v-8.54L22 3z';

    // ---------- Utilitários ----------

    function esc(s) {
        if (s == null) return '';
        return String(s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    function isNumeric(c) { return c.type === 'number'; }

    function defaultAlign(c) {
        if (c.align) return c.align;
        return isNumeric(c) ? 'right' : 'left';
    }

    function getValue(row, col) {
        return col.getValue ? col.getValue(row) : row[col.key];
    }

    function getFilterKey(v, col, row) {
        var key = col.filterValue ? col.filterValue(v, row) : v;
        return key == null ? '' : String(key);
    }

    function fmtDefault(v, col, row) {
        if (col.format) return col.format(v, row);
        if (typeof v === 'number') return v.toLocaleString('pt-BR');
        if (v == null) return '';
        return String(v);
    }

    function svg(pathD, extraAttrs) {
        var attrs = extraAttrs || {};
        var w = attrs.w || 10, h = attrs.h || 10;
        var fill = attrs.fill || 'currentColor';
        var stroke = attrs.stroke ? ' stroke="' + attrs.stroke + '" stroke-width="2" stroke-linejoin="round"' : '';
        return '<svg width="' + w + '" height="' + h + '" viewBox="0 0 24 24" fill="' + fill + '"' + stroke + '>' +
               '<path d="' + pathD + '"/></svg>';
    }

    // ---------- Classe ----------

    function SmartTable(container, config) {
        if (!container) throw new Error('SmartTable: container obrigatório.');
        this.container = typeof container === 'string' ? document.querySelector(container) : container;
        if (!this.container) throw new Error('SmartTable: container não encontrado.');

        var cfg = config || {};
        this.columns    = cfg.columns || [];
        this.rows       = cfg.rows || [];
        this.sortable   = cfg.sortable !== false;
        this.filterable = cfg.filterable !== false;
        this.searchable = !!cfg.searchable;
        this.totals     = !!cfg.totals;
        this.dense      = !!cfg.dense;
        this.onRowClick = cfg.onRowClick || null;
        this.rowClass   = cfg.rowClass || null;
        this.emptyText  = cfg.emptyText || 'Nenhum resultado.';
        this.loadingText= cfg.loadingText || 'Carregando…';
        this.maxHeight  = cfg.maxHeight || null;
        this.dataBarColorForCol = cfg.dataBarColorForCol || null; // (col, row, value) => 'accent'|'danger'|'success'|null

        this.sort        = cfg.initialSort || null;
        this.query       = '';
        this.filters     = {};
        this.openFilter  = null;
        this.filterQuery = '';
        this.loading     = !!cfg.loading;

        // Persistência opcional em localStorage — se `persistKey` é passado, restaura
        // sort/filters/query no init e re-salva a cada mudança.
        this.persistKey  = cfg.persistKey || null;
        if (this.persistKey) {
            try {
                var saved = localStorage.getItem('smartTable:' + this.persistKey);
                if (saved) {
                    var s = JSON.parse(saved);
                    if (s.sort)    this.sort = s.sort;
                    if (s.query)   this.query = s.query;
                    if (s.filters) this.filters = s.filters;
                }
            } catch (e) { /* localStorage bloqueado ou JSON inválido — ignora */ }
        }

        this._popoverEl  = null;
        this._onDocMousedown = this._handleDocMousedown.bind(this);
        this._onWindowResize = this._closeFilter.bind(this);
        this._onWindowScroll = this._handleWindowScroll.bind(this);
        document.addEventListener('mousedown', this._onDocMousedown);
        window.addEventListener('resize', this._onWindowResize);
        // capture phase pra pegar scroll dos ancestrais também, mas ignora scroll
        // *dentro* do popover (senão rolar a lista de valores fecha o filtro).
        window.addEventListener('scroll', this._onWindowScroll, true);

        this.container.classList.add('st-scope');
        this._render();
    }

    SmartTable.prototype.setRows = function (rows) {
        this.rows = rows || [];
        this.loading = false;
        // Dados novos → filtros/valores podem estar defasados; fecha popover se aberto.
        this._closeFilter();
        this._render();
    };

    SmartTable.prototype.setLoading = function (loading) {
        this.loading = !!loading;
        if (loading) this._closeFilter();
        this._render();
    };

    SmartTable.prototype.setColumns = function (columns) {
        this.columns = columns || [];
        this.filters = {};
        this._render();
    };

    SmartTable.prototype.clearFilters = function () {
        this.filters = {};
        this._persistState();
        this._render();
    };

    SmartTable.prototype._persistState = function () {
        if (!this.persistKey) return;
        try {
            localStorage.setItem('smartTable:' + this.persistKey, JSON.stringify({
                sort: this.sort, query: this.query, filters: this.filters
            }));
        } catch (e) { /* cota cheia ou bloqueado — silencioso */ }
    };

    SmartTable.prototype.getFilteredRows = function () {
        return this._computeFiltered();
    };

    SmartTable.prototype.destroy = function () {
        document.removeEventListener('mousedown', this._onDocMousedown);
        window.removeEventListener('resize', this._onWindowResize);
        window.removeEventListener('scroll', this._onWindowScroll, true);
        this._closeFilter();
        this.container.innerHTML = '';
        this.container.classList.remove('st-scope');
    };

    // ---------- Filtragem / ordenação ----------

    SmartTable.prototype._computeFiltered = function () {
        var self = this;
        var cols = this.columns;

        // 1) filtros por coluna
        var colFiltered = this.rows.filter(function (r) {
            return cols.every(function (c) {
                var sel = self.filters[c.key];
                if (!sel || sel.length === 0) return true;
                return sel.indexOf(getFilterKey(getValue(r, c), c, r)) !== -1;
            });
        });

        // 2) busca global
        var q = this.query.trim().toLowerCase();
        if (q) {
            colFiltered = colFiltered.filter(function (r) {
                return cols.some(function (c) {
                    var v = getValue(r, c);
                    return String(v == null ? '' : v).toLowerCase().indexOf(q) !== -1;
                });
            });
        }

        // 3) ordenação
        if (this.sort) {
            var col = cols.find(function (c) { return c.key === self.sort.key; });
            if (col) {
                var dir = this.sort.dir === 'asc' ? 1 : -1;
                colFiltered = colFiltered.slice().sort(function (a, b) {
                    var va = getValue(a, col);
                    var vb = getValue(b, col);
                    if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir;
                    if (va == null && vb == null) return 0;
                    if (va == null) return 1;
                    if (vb == null) return -1;
                    return String(va).localeCompare(String(vb), 'pt-BR', { numeric: true, sensitivity: 'base' }) * dir;
                });
            }
        }
        return colFiltered;
    };

    SmartTable.prototype._computeMaxima = function () {
        var maxima = {};
        var rows = this.rows;
        this.columns.forEach(function (c) {
            if (!c.dataBar) return;
            var max = 0;
            for (var i = 0; i < rows.length; i++) {
                var v = getValue(rows[i], c);
                if (typeof v === 'number' && Math.abs(v) > max) max = Math.abs(v);
            }
            maxima[c.key] = max;
        });
        return maxima;
    };

    // ---------- Render principal ----------

    SmartTable.prototype._render = function () {
        var filtered = this._computeFiltered();
        var maxima   = this._computeMaxima();

        var html = '';
        html += this._renderToolbar(filtered.length);
        html += '<div class="st-table-wrap"' + (this.maxHeight ? ' style="max-height:' + this.maxHeight + '"' : '') + '>';
        html += '<table class="st-table' + (this.dense ? ' st-dense' : '') + '">';
        html +=   this._renderThead();
        html +=   this._renderTbody(filtered, maxima);
        html +=   this._renderTfoot(filtered);
        html += '</table></div>';

        this.container.innerHTML = html;
        this._bindEvents();
    };

    SmartTable.prototype._renderToolbar = function (filteredCount) {
        var activeFilters = 0;
        var self = this;
        Object.keys(this.filters).forEach(function (k) {
            if (self.filters[k] && self.filters[k].length) activeFilters++;
        });
        if (!this.searchable && activeFilters === 0) return '';

        var out = '<div class="st-toolbar">';
        if (this.searchable) {
            out += '<input type="text" class="st-search" placeholder="Buscar…" value="' + esc(this.query) + '" />';
        }
        if (this.query || activeFilters > 0) {
            out += '<span class="st-count">' + filteredCount + ' / ' + this.rows.length + '</span>';
        }
        if (activeFilters > 0) {
            out += '<button type="button" class="st-clear-filters">Limpar filtros (' + activeFilters + ')</button>';
        }
        out += '</div>';
        return out;
    };

    SmartTable.prototype._renderThead = function () {
        var self = this;
        var html = '<thead><tr>';
        this.columns.forEach(function (c) {
            var align = defaultAlign(c);
            var sortable = self.sortable && c.sortable !== false;
            var filterable = self.filterable && c.filterable !== false;
            var isSorted = self.sort && self.sort.key === c.key;
            var hasFilter = (self.filters[c.key] || []).length > 0;

            var styles = 'text-align:' + align + ';';
            if (c.width)    styles += 'width:'    + c.width    + ';';
            if (c.minWidth) styles += 'min-width:' + c.minWidth + ';';

            var thCls = 'st-th';
            if (sortable)  thCls += ' st-th-sortable';
            if (isSorted)  thCls += ' st-th-sorted';
            if (hasFilter) thCls += ' st-th-filtered';

            html += '<th class="' + thCls + '" data-key="' + esc(c.key) + '" style="' + styles + '">';
            html +=   '<span class="st-th-inner">';
            html +=     '<span class="st-th-label" data-role="sort">' + esc(c.label) + '</span>';
            if (isSorted) {
                html += '<span class="st-th-sort-icon" data-role="sort">' +
                        svg(self.sort.dir === 'asc' ? ARROW_UP : ARROW_DOWN, { w: 10, h: 10 }) +
                        '</span>';
            }
            if (filterable) {
                html += '<button type="button" class="st-th-filter-btn' + (hasFilter ? ' is-active' : '') +
                        '" data-role="filter" aria-label="Filtrar ' + esc(c.label) + '">' +
                        svg(FUNNEL, { w: 11, h: 11, fill: hasFilter ? 'currentColor' : 'none', stroke: 'currentColor' }) +
                        '</button>';
            }
            html +=   '</span>';
            html += '</th>';
        });
        html += '</tr></thead>';
        return html;
    };

    SmartTable.prototype._renderTbody = function (rows, maxima) {
        var self = this;
        var cols = this.columns;
        var html = '<tbody>';

        if (this.loading) {
            html += '<tr><td class="st-td-empty" colspan="' + cols.length + '">' +
                    '<span class="st-spinner"></span> ' + esc(this.loadingText) +
                    '</td></tr>';
        } else if (rows.length === 0) {
            html += '<tr><td class="st-td-empty" colspan="' + cols.length + '">' + esc(this.emptyText) + '</td></tr>';
        } else {
            rows.forEach(function (row, ri) {
                var trCls = 'st-row';
                if (self.onRowClick) trCls += ' st-row-clickable';
                if (self.rowClass) {
                    var extra = self.rowClass(row);
                    if (extra) trCls += ' ' + extra;
                }
                html += '<tr class="' + trCls + '" data-row-idx="' + ri + '">';
                cols.forEach(function (c) {
                    var v = getValue(row, c);
                    var align = defaultAlign(c);
                    var mono = c.mono || isNumeric(c);
                    var cls = 'st-td';
                    if (mono) cls += ' st-td-mono';
                    if (c.tdClass) cls += ' ' + c.tdClass(v, row);

                    var barPct = null;
                    if (c.dataBar && maxima[c.key] > 0 && typeof v === 'number') {
                        barPct = Math.min(100, (Math.abs(v) / maxima[c.key]) * 100);
                    }
                    var barColor = 'accent';
                    if (barPct !== null) {
                        if (c.dataBarColor)                barColor = c.dataBarColor(v, row) || 'accent';
                        else if (self.dataBarColorForCol)  barColor = self.dataBarColorForCol(c, row, v) || 'accent';
                    }

                    var content = c.render ? c.render(v, row) : esc(fmtDefault(v, c, row));

                    html += '<td class="' + cls + '" style="text-align:' + align + '">';
                    if (barPct !== null) {
                        var side = align === 'left' ? 'left' : 'right';
                        html += '<span class="st-databar st-databar-' + barColor + ' st-databar-' + side +
                                '" style="width:calc(' + barPct + '% - 8px)"></span>';
                    }
                    html += '<span class="st-td-content">' + content + '</span>';
                    html += '</td>';
                });
                html += '</tr>';
            });
        }
        html += '</tbody>';
        return html;
    };

    SmartTable.prototype._renderTfoot = function (rows) {
        if (!this.totals || rows.length === 0 || this.loading) return '';
        var cols = this.columns;
        var totals = cols.map(function (c) {
            if (!isNumeric(c) || c.total === false) return null;
            var sum = 0;
            for (var i = 0; i < rows.length; i++) {
                var v = getValue(rows[i], c);
                if (typeof v === 'number') sum += v;
            }
            return sum;
        });

        var html = '<tfoot><tr class="st-totals">';
        cols.forEach(function (c, i) {
            var align = defaultAlign(c);
            var content = '';
            if (i === 0 && totals[0] === null) {
                content = 'Total';
            } else if (totals[i] !== null) {
                content = c.format ? c.format(totals[i], null) : totals[i].toLocaleString('pt-BR');
            }
            html += '<td class="st-td st-td-total" style="text-align:' + align + '">' + content + '</td>';
        });
        html += '</tr></tfoot>';
        return html;
    };

    // ---------- Bindings ----------

    SmartTable.prototype._bindEvents = function () {
        var self = this;

        // Busca global
        var search = this.container.querySelector('.st-search');
        if (search) {
            search.addEventListener('input', function (e) {
                self.query = e.target.value;
                self._persistState();
                self._render();
                // devolver o foco pro campo de busca depois do re-render
                var next = self.container.querySelector('.st-search');
                if (next) {
                    next.focus();
                    var len = next.value.length;
                    next.setSelectionRange(len, len);
                }
            });
        }

        // Botão limpar filtros
        var clear = this.container.querySelector('.st-clear-filters');
        if (clear) {
            clear.addEventListener('click', function () {
                self.filters = {};
                self._persistState();
                self._render();
            });
        }

        // Sort no header
        this.container.querySelectorAll('.st-th-sortable').forEach(function (th) {
            th.addEventListener('click', function (e) {
                if (e.target.closest('.st-th-filter-btn')) return;
                var key = th.getAttribute('data-key');
                var col = self.columns.find(function (c) { return c.key === key; });
                if (col) self._clickSort(col);
            });
        });

        // Funnel dos filtros
        this.container.querySelectorAll('.st-th-filter-btn').forEach(function (btn) {
            btn.addEventListener('click', function (e) {
                e.stopPropagation();
                var th = btn.closest('.st-th');
                var key = th.getAttribute('data-key');
                var col = self.columns.find(function (c) { return c.key === key; });
                if (col) self._openFilterFor(col, btn);
            });
        });

        // Row click
        if (this.onRowClick) {
            this.container.querySelectorAll('.st-row-clickable').forEach(function (tr) {
                tr.addEventListener('click', function () {
                    var idx = parseInt(tr.getAttribute('data-row-idx'), 10);
                    var visible = self._computeFiltered();
                    if (!isNaN(idx) && visible[idx]) self.onRowClick(visible[idx]);
                });
            });
        }
    };

    SmartTable.prototype._clickSort = function (col) {
        if (!this.sortable || col.sortable === false) return;
        if (this.sort && this.sort.key === col.key) {
            if (this.sort.dir === 'asc') this.sort = { key: col.key, dir: 'desc' };
            else                          this.sort = null;
        } else {
            this.sort = { key: col.key, dir: isNumeric(col) ? 'desc' : 'asc' };
        }
        this._persistState();
        this._render();
    };

    // ---------- Popover de filtro ----------

    SmartTable.prototype._openFilterFor = function (col, anchor) {
        if (this.openFilter && this.openFilter.key === col.key) {
            this._closeFilter();
            return;
        }
        this.filterQuery = '';
        this.openFilter = { key: col.key };
        this._renderFilterPopover(col, anchor);
    };

    SmartTable.prototype._renderFilterPopover = function (col, anchor) {
        this._closeFilter(true); // remove existente sem apagar this.openFilter

        var self = this;
        var rect = anchor.getBoundingClientRect();
        var width = 260;
        var x = Math.min(rect.left, window.innerWidth - width - 8);
        var y = rect.bottom + 4;

        var pop = document.createElement('div');
        pop.className = 'st-popover';
        pop.style.left = x + 'px';
        pop.style.top  = y + 'px';
        pop.setAttribute('data-key', col.key);

        var distinct = this._distinctForColumn(col);
        var fq = this.filterQuery.trim().toLowerCase();
        if (fq) distinct = distinct.filter(function (d) { return d.value.toLowerCase().indexOf(fq) !== -1; });

        var selectedSet = {};
        (this.filters[col.key] || []).forEach(function (v) { selectedSet[v] = true; });

        // Contagens dos botões em massa
        var visibleCount = distinct.length;
        var selectedCount = (this.filters[col.key] || []).length;

        var html = '';
        html += '<div class="st-popover-search-wrap">';
        html +=   '<input type="text" class="st-popover-search" placeholder="Buscar valores…" value="' + esc(this.filterQuery) + '" />';
        html += '</div>';
        html += '<div class="st-popover-bulk">';
        html +=   '<button type="button" class="st-popover-select-all"' +
                    (visibleCount === 0 ? ' disabled' : '') + '>Selecionar todos' +
                    (visibleCount > 0 ? ' (' + visibleCount + ')' : '') + '</button>';
        html +=   '<button type="button" class="st-popover-deselect-all"' +
                    (selectedCount === 0 ? ' disabled' : '') + '>Desmarcar todos</button>';
        html += '</div>';
        html += '<div class="st-popover-list">';
        if (distinct.length === 0) {
            html += '<div class="st-popover-empty">Sem valores.</div>';
        } else {
            distinct.forEach(function (d) {
                var checked = selectedSet[d.value] ? ' checked' : '';
                var label = d.display != null ? d.display : d.value;
                html += '<label class="st-popover-item">' +
                        '<input type="checkbox" data-value="' + esc(d.value) + '"' + checked + ' />' +
                        '<span class="st-popover-label">' + esc(label || '(vazio)') + '</span>' +
                        '<span class="st-popover-count">' + d.count + '</span>' +
                        '</label>';
            });
        }
        html += '</div>';
        html += '<div class="st-popover-footer">';
        html +=   '<button type="button" class="st-popover-done">Aplicar</button>';
        html += '</div>';

        pop.innerHTML = html;
        document.body.appendChild(pop);
        this._popoverEl = pop;

        // busca dentro do popover
        var searchInput = pop.querySelector('.st-popover-search');
        searchInput.addEventListener('input', function (e) {
            self.filterQuery = e.target.value;
            self._renderFilterPopover(col, anchor);
            // devolver foco e cursor pro fim, senão cada tecla entra na posição 0
            // e a digitação aparece invertida.
            var next = document.querySelector('.st-popover .st-popover-search');
            if (next) {
                next.focus();
                var len = next.value.length;
                next.setSelectionRange(len, len);
            }
        });
        setTimeout(function () {
            searchInput.focus();
            var len = searchInput.value.length;
            searchInput.setSelectionRange(len, len);
        }, 0);

        // toggle checkbox
        pop.querySelectorAll('.st-popover-item input[type="checkbox"]').forEach(function (cb) {
            cb.addEventListener('change', function () {
                var v = cb.getAttribute('data-value');
                var sel = self.filters[col.key] || [];
                if (cb.checked) {
                    if (sel.indexOf(v) === -1) sel = sel.concat([v]);
                } else {
                    sel = sel.filter(function (x) { return x !== v; });
                }
                self.filters[col.key] = sel;
                self._persistState();
                // Re-render da tabela sem fechar o popover:
                self._render();
                // O _render fecha o popover; reabrimos:
                var newBtn = self.container.querySelector('.st-th[data-key="' + col.key + '"] .st-th-filter-btn');
                if (newBtn) self._renderFilterPopover(col, newBtn);
            });
        });

        // botão Selecionar todos — respeita a busca dentro do popover.
        // Ex.: digitou "estagi", clica "Selecionar todos" → seleciona todos
        // os estagiários visíveis, mantendo qualquer coisa já selecionada
        // fora do filtro atual.
        pop.querySelector('.st-popover-select-all').addEventListener('click', function () {
            var sel = self.filters[col.key] || [];
            distinct.forEach(function (d) {
                if (sel.indexOf(d.value) === -1) sel = sel.concat([d.value]);
            });
            self.filters[col.key] = sel;
            self._persistState();
            self._render();
            var newBtn = self.container.querySelector('.st-th[data-key="' + col.key + '"] .st-th-filter-btn');
            if (newBtn) self._renderFilterPopover(col, newBtn);
        });

        // botão Desmarcar todos — limpa completamente o filtro da coluna.
        pop.querySelector('.st-popover-deselect-all').addEventListener('click', function () {
            self.filters[col.key] = [];
            self._persistState();
            self._render();
            var newBtn = self.container.querySelector('.st-th[data-key="' + col.key + '"] .st-th-filter-btn');
            if (newBtn) self._renderFilterPopover(col, newBtn);
        });

        // botão Aplicar
        pop.querySelector('.st-popover-done').addEventListener('click', function () {
            self._closeFilter();
        });
    };

    SmartTable.prototype._distinctForColumn = function (col) {
        var self = this;
        var cols = this.columns;
        // distinct considera outros filtros já ativos, mas ignora o filtro da própria coluna
        var base = this.rows.filter(function (r) {
            return cols.every(function (c) {
                if (c.key === col.key) return true;
                var sel = self.filters[c.key];
                if (!sel || sel.length === 0) return true;
                return sel.indexOf(getFilterKey(getValue(r, c), c, r)) !== -1;
            });
        });
        var counts = {};
        var displays = {};
        base.forEach(function (r) {
            var v = getValue(r, col);
            var key = getFilterKey(v, col, r);
            counts[key] = (counts[key] || 0) + 1;
            if (displays[key] === undefined) {
                // Ordem de fallback: filterDisplay → format → key (já processado por filterValue) → v bruto.
                // Usar `key` como fallback antes de `v` garante que colunas com filterValue: fmtDate
                // exibam dd/mm/aaaa no popover em vez do ISO cru.
                displays[key] = col.filterDisplay
                    ? col.filterDisplay(v, r)
                    : (col.format ? col.format(v, r) : (col.filterValue ? key : v));
            }
        });
        var arr = Object.keys(counts).map(function (k) {
            return { value: k, display: displays[k], count: counts[k] };
        });
        arr.sort(function (a, b) {
            return String(a.value).localeCompare(String(b.value), 'pt-BR', { numeric: true, sensitivity: 'base' });
        });
        return arr;
    };

    SmartTable.prototype._closeFilter = function (keepState) {
        if (this._popoverEl && this._popoverEl.parentNode) {
            this._popoverEl.parentNode.removeChild(this._popoverEl);
        }
        this._popoverEl = null;
        if (!keepState) {
            this.openFilter = null;
            this.filterQuery = '';
        }
    };

    SmartTable.prototype._handleWindowScroll = function (e) {
        if (!this._popoverEl) return;
        // Scroll dentro do próprio popover não deve fechar (senão rolar a lista de valores fecha).
        if (e.target && this._popoverEl.contains && this._popoverEl.contains(e.target)) return;
        // Também considera o caso em que o target é o próprio Document (scroll da página) —
        // aí sim fecha.
        this._closeFilter();
    };

    SmartTable.prototype._handleDocMousedown = function (e) {
        if (!this._popoverEl) return;
        if (this._popoverEl.contains(e.target)) return;
        // Clique num botão de funnel já é tratado pelo próprio botão (toggle).
        if (e.target.closest('.st-th-filter-btn')) return;
        this._closeFilter();
    };

    // ---------- Export ----------

    global.SmartTable = SmartTable;
})(window);

// ===== INICIO - Aviso de Cobranca (v4) =====
//
// Modulo de classificacao e geracao do relatorio de cobranca.
//
// MUDANCAS EM RELACAO A v3:
//   - Paleta refeita: cada situacao passa a ter TINT (fundo da linha) e RAIL
//     (barra saturada de 3px + cor do texto do badge). Codificacao em dois
//     canais sobrevive a compressao do WhatsApp e a impressao em preto e branco.
//   - Todas as combinacoes de fundo/texto validadas em WCAG AA (4.5:1); a
//     maioria em AAA. Tabela de contrastes no comentario de cada situacao.
//   - "Prazo final" saiu do lilas para cinza-quente: o ambar passa a pertencer
//     exclusivamente ao trilho cartorio, eliminando uma colisao em deuteranopia.
//   - Cabecalho em azul-petroleo (#16232F) no lugar de preto.
//   - Numeros com tabular-nums: casas decimais alinhadas em coluna.
//   - Rotulo interno "Verificar posicao" nao vaza para o documento do cliente
//     (ver ROTULOS_INTERNOS_NO_DOCUMENTO abaixo).
//
(function () {
    'use strict';

    if (window.__avisoCobrancaInstalado) return;
    window.__avisoCobrancaInstalado = true;
    window.__smartTableUtil?.registrarModuloCarregado?.('Aviso de Cobrança');

    // ============================================================
    // CONFIGURACAO
    // ============================================================

    const HTML2CANVAS_URL =
        'https://unpkg.com/html2canvas-pro@1.5.8/dist/html2canvas-pro.min.js';

    const SELETOR_TABELA = '#tabela-titulos-ds table';

    // "Verificar posicao" e um estado OPERACIONAL: quem verifica e o negociador,
    // nao o cliente. Como a imagem vai por WhatsApp para o devedor, por padrao o
    // documento mostra um rotulo neutro e o termo interno fica apenas no destaque
    // da tela e no console.
    // Coloque true se preferir que o rotulo interno apareca tambem na imagem.
    const ROTULOS_INTERNOS_NO_DOCUMENTO = false;

    // Colunas exigidas, pelo data-key emitido pela SmartTable.
    const COLUNAS_EXIGIDAS = [
        'numeroTitulo',
        'razaoSocial',
        'dataVencimento',
        'posicaoDescricao',
        'valorEmAberto',
        'diasAtraso',
        'portadorDescricao',
        'sequencia'
    ];

    // Portadores que sabidamente demoram mais de 1 dia útil pra atualizar a
    // posicaoDescricao pra CARTORIO no sistema, mesmo com o título já
    // protestado de fato. Comparação sem acento/caixa (ver normalizarTexto).
    const PORTADORES_CARTORIO_LENTO_PARA_ATUALIZAR = ['ITAU'];

    // Valores de posicaoDescricao que significam "não cobrar este título",
    // confirmados com o usuário. Comparação sem acento/caixa (normalizarTexto).
    const POSICOES_EXCLUIDAS_DE_COBRANCA = ['NAO COBRAR', 'CARTEIRA'];

    // Prazo-base em dias corridos a partir do vencimento (vencimento = dia 0).
    const DIAS_PRAZO_BASE = 6;

    // Faixa de atraso considerada "inicial", antes do prazo-base.
    const DIAS_ATRASO_MIN = 1;
    const DIAS_ATRASO_MAX = 5;

    // Feriados especificos da empresa ou do municipio, no formato AAAA-MM-DD.
    // Bancos fechados em feriado municipal contam para o prazo.
    const FERIADOS_ADICIONAIS = [];

    // Feriados nacionais de data fixa.
    const FERIADOS_FIXOS = [
        '01-01', // Confraternizacao Universal
        '04-21', // Tiradentes
        '05-01', // Dia Mundial do Trabalho
        '09-07', // Independencia do Brasil
        '10-12', // Nossa Senhora Aparecida
        '11-02', // Finados
        '11-15', // Proclamacao da Republica
        '12-25'  // Natal
    ];

    // Consciencia Negra so passou a ser feriado nacional em 2024 (Lei 14.759/2023).
    const CONSCIENCIA_NEGRA = { mesDia: '11-20', vigenteA_partir_de: 2024 };

    // ============================================================
    // TOKENS VISUAIS
    // ============================================================
    //
    // Contrastes sobre papel branco:
    //   tinta      17.48:1  AAA
    //   tinta2      6.40:1  AA
    //   branco sobre cabecalho  15.96:1  AAA
    //   atencao     7.18:1  AAA
    //
    const TOKENS = {
        papel:      '#FFFFFF',
        superficie: '#F6F8FA',
        cabecalho:  '#16232F',  // azul-petroleo: le como extrato bancario, nao como template
        tinta:      '#151A21',
        tinta2:     '#55606D',
        divisor:    '#DFE3E8',
        atencao:    '#8A6608'   // marcador de divergencia de dias
    };

    // ============================================================
    // REGISTRO DE SITUACOES
    // ============================================================
    //
    // Fonte unica de verdade: cores, rotulo, ordem na legenda e aviso.
    //
    // Codificacao em dois canais:
    //   tint = fundo da linha        -> agrupamento visual
    //   rail = barra 3px + cor texto -> diferenciacao que sobrevive a P&B
    //
    // Trilhos semanticos (matiz != gravidade):
    //   neutro frio / quente = informativo
    //   vermelho             = acao necessaria hoje
    //   ambar                = trilho cartorio
    //   indigo               = trilho SCPC
    //   violeta              = flag operacional interno
    //
    const SITUACOES = {
        // texto/tint 15.4 AAA | rail/tint 5.96 AA
        EM_ATRASO: {
            ordem: 1,
            rotulo: () => 'Em atraso',
            rotuloLegenda: 'Em atraso (1 a 5 dias)',
            tint: '#EDF1F5', rail: '#4E5D6C', corTexto: '#151A21',
            pintaTela: false
        },
        // texto/tint 15.5 AAA | rail/tint 5.51 AA
        PRAZO_FINAL: {
            ordem: 2,
            rotulo: (reg) => 'Prazo final em ' + formatarDataBr(reg.prazos.dataLimitePagamento),
            rotuloLegenda: 'Prazo final prorrogado (6º dia em dia não útil)',
            tint: '#F5F1EA', rail: '#6B5F52', corTexto: '#151A21',
            pintaTela: false
        },
        // texto/tint 14.9 AAA | rail/tint 6.30 AA
        // Rail e o mais escuro do conjunto (L=9.2%): urgencia por profundidade,
        // nao por vermelho berrante.
        ULTIMO_DIA: {
            ordem: 3,
            rotulo: () => 'Último dia para pagamento',
            rotuloLegenda: 'Último dia para pagamento',
            tint: '#FBE9E3', rail: '#A3251A', corTexto: '#151A21',
            pintaTela: true,
            aviso: {
                titulo: 'Cartório — Último dia para pagamento',
                texto: 'Último dia para regularização. Caso o pagamento não seja identificado ' +
                       'até o final do expediente bancário de hoje, o título será encaminhado ' +
                       'automaticamente para cartório.',
                borda: '#E8D4CC', fundo: '#FDF6F3'
            },
            avisoScpc: {
                titulo: 'SCPC — Último dia antes da negativação',
                texto: 'Após o último dia para ' +
                       'pagamento, o título será encaminhado automaticamente para negativação ' +
                       'junto ao SCPC.',
                borda: '#CDD3EA', fundo: '#F4F6FC'
            }
        },
        // texto/tint 14.2 AAA | rail/tint 5.17 AA
        EM_CARTORIO: {
            ordem: 4,
            rotulo: () => 'Em cartório',
            rotuloLegenda: 'Em cartório',
            tint: '#F8E7B0', rail: '#7A5A0C', corTexto: '#151A21',
            pintaTela: true
        },
        // texto/tint 14.6 AAA | rail/tint 8.28 AAA
        NEGATIVADO_SCPC: {
            ordem: 5,
            rotulo: () => 'Negativado (SCPC)',
            rotuloLegenda: 'Negativado (SCPC)',
            tint: '#E7EAF6', rail: '#313A8C', corTexto: '#151A21',
            pintaTela: true
        },
        // texto/tint 14.8 AAA | rail/tint 7.39 AAA
        VERIFICAR_POSICAO: {
            ordem: 6,
            rotulo: () => 'Verificar posição',
            // Rotulo neutro usado no documento que vai para o cliente.
            rotuloCliente: () => 'Vencido',
            rotuloLegenda: 'Verificar posição no sistema',
            rotuloLegendaCliente: 'Vencido',
            tint: '#EFEAF4', rail: '#54407C', corTexto: '#151A21',
            pintaTela: true
        }
    };

    // Rotulo do badge no documento, respeitando o flag de rotulos internos.
    function rotuloDocumento(situacao, registro) {
        if (!ROTULOS_INTERNOS_NO_DOCUMENTO && situacao.rotuloCliente) {
            return situacao.rotuloCliente(registro);
        }
        return situacao.rotulo(registro);
    }

    function rotuloLegendaDocumento(situacao) {
        if (!ROTULOS_INTERNOS_NO_DOCUMENTO && situacao.rotuloLegendaCliente) {
            return situacao.rotuloLegendaCliente;
        }
        return situacao.rotuloLegenda;
    }

    // ============================================================
    // CALENDARIO
    // ============================================================

    // Meio-dia evita que horario de verao empurre a data para o dia anterior.
    function normalizarData(data) {
        const d = new Date(data);
        d.setHours(12, 0, 0, 0);
        return d;
    }

    function chaveData(data) {
        const ano = data.getFullYear();
        const mes = String(data.getMonth() + 1).padStart(2, '0');
        const dia = String(data.getDate()).padStart(2, '0');
        return ano + '-' + mes + '-' + dia;
    }

    function formatarDataBr(data) {
        const dia = String(data.getDate()).padStart(2, '0');
        const mes = String(data.getMonth() + 1).padStart(2, '0');
        return dia + '/' + mes;
    }

    function adicionarDias(data, quantidade) {
        const d = normalizarData(data);
        d.setDate(d.getDate() + quantidade);
        return normalizarData(d);
    }

    function mesmaData(a, b) {
        return normalizarData(a).getTime() === normalizarData(b).getTime();
    }

    function compararDatas(a, b) {
        const ta = normalizarData(a).getTime();
        const tb = normalizarData(b).getTime();
        return ta < tb ? -1 : (ta > tb ? 1 : 0);
    }

    function diferencaEmDias(maior, menor) {
        const ms = normalizarData(maior).getTime() - normalizarData(menor).getTime();
        return Math.round(ms / 86400000);
    }

    // Algoritmo de Meeus/Butcher. Base para os tres feriados moveis brasileiros.
    function calcularPascoa(ano) {
        const a = ano % 19;
        const b = Math.floor(ano / 100);
        const c = ano % 100;
        const d = Math.floor(b / 4);
        const e = b % 4;
        const f = Math.floor((b + 8) / 25);
        const g = Math.floor((b - f + 1) / 3);
        const h = (19 * a + b - d - g + 15) % 30;
        const i = Math.floor(c / 4);
        const k = c % 4;
        const l = (32 + 2 * e + 2 * i - h - k) % 7;
        const m = Math.floor((a + 11 * h + 22 * l) / 451);
        const mes = Math.floor((h + l - 7 * m + 114) / 31);
        const dia = ((h + l - 7 * m + 114) % 31) + 1;
        return new Date(ano, mes - 1, dia, 12, 0, 0, 0);
    }

    // Memoiza por ano: com milhares de linhas, recalcular a cada consulta pesa.
    const _feriadosPorAno = new Map();

    function feriadosDoAno(ano) {
        if (_feriadosPorAno.has(ano)) return _feriadosPorAno.get(ano);

        const pascoa = calcularPascoa(ano);
        const aPartirDaPascoa = (offset) => chaveData(adicionarDias(pascoa, offset));

        const datas = FERIADOS_FIXOS.map(md => ano + '-' + md);

        if (ano >= CONSCIENCIA_NEGRA.vigenteA_partir_de) {
            datas.push(ano + '-' + CONSCIENCIA_NEGRA.mesDia);
        }

        datas.push(aPartirDaPascoa(-48)); // Carnaval (segunda)
        datas.push(aPartirDaPascoa(-47)); // Carnaval (terca)
        datas.push(aPartirDaPascoa(-2));  // Sexta-feira Santa
        datas.push(aPartirDaPascoa(60));  // Corpus Christi

        FERIADOS_ADICIONAIS.forEach(d => datas.push(d));

        const conjunto = new Set(datas);
        _feriadosPorAno.set(ano, conjunto);
        return conjunto;
    }

    function ehFeriado(data) {
        return feriadosDoAno(data.getFullYear()).has(chaveData(data));
    }

    function ehDiaUtil(data) {
        const diaSemana = data.getDay();
        if (diaSemana === 0 || diaSemana === 6) return false;
        return !ehFeriado(data);
    }

    // Se a propria data ja for util, ela e retornada.
    function primeiroDiaUtilAPartirDe(data) {
        let d = normalizarData(data);
        let guarda = 0;
        while (!ehDiaUtil(d)) {
            d = adicionarDias(d, 1);
            if (++guarda > 30) {
                throw new Error('Não foi possível encontrar dia útil a partir de ' + chaveData(data));
            }
        }
        return d;
    }

    // Sempre procura um dia util DEPOIS da data informada.
    function proximoDiaUtil(data) {
        return primeiroDiaUtilAPartirDe(adicionarDias(data, 1));
    }

    function calcularPrazos(dataVencimento) {
        const vencimento = normalizarData(dataVencimento);
        const dataSextoDia = adicionarDias(vencimento, DIAS_PRAZO_BASE);
        const dataLimitePagamento = primeiroDiaUtilAPartirDe(dataSextoDia);
        const dataEncaminhamento = proximoDiaUtil(dataLimitePagamento);
        return { dataVencimento: vencimento, dataSextoDia, dataLimitePagamento, dataEncaminhamento };
    }

    // ============================================================
    // LEITURA DO DOM
    // ============================================================

    // Remove acentos e padroniza caixa -- usado pra comparar texto vindo do
    // CRM (ex.: nome de portador) sem depender de como cada banco foi
    // digitado ("Itaú" vs "ITAU S/A" vs "itau").
    function normalizarTexto(texto) {
        return (texto || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toUpperCase();
    }

    function esc(texto) {
        if (texto == null) return '';
        return String(texto).replace(/[&<>"']/g, c =>
            ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
        );
    }

    function extrairDias(texto) {
        if (!texto) return null;
        const m = texto.match(/(\d+)/);
        return m ? parseInt(m[1], 10) : null;
    }

    function converterDataBrasileira(texto) {
        if (!texto) return null;
        const m = texto.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
        if (!m) return null;

        const dia = parseInt(m[1], 10);
        const mes = parseInt(m[2], 10);
        let ano = parseInt(m[3], 10);
        if (ano < 100) ano += 2000;

        const data = new Date(ano, mes - 1, dia, 12, 0, 0, 0);
        const valida = data.getFullYear() === ano
                    && data.getMonth() === mes - 1
                    && data.getDate() === dia;
        return valida ? data : null;
    }

    function localizarTabela() {
        const direta = document.querySelector(SELETOR_TABELA);
        if (direta) return direta;

        // Fallback: le apenas o cabecalho, nao o textContent da tabela inteira.
        const candidatas = document.querySelectorAll('table');
        for (const t of candidatas) {
            const cab = (t.querySelector('thead') || {}).textContent || '';
            const up = cab.toUpperCase();
            if (up.includes('ATRASO') && up.includes('RAZ')) return t;
        }
        return null;
    }

    // Deriva os indices do data-key emitido pela SmartTable, em vez de fixar
    // numeros. Se uma coluna for adicionada, removida ou reordenada, continua
    // funcionando; se sumir de vez, falha com mensagem clara.
    function mapearColunas(tabela) {
        const idx = {};
        tabela.querySelectorAll('thead th[data-key]').forEach((th, i) => {
            idx[th.dataset.key] = i;
        });

        const faltando = COLUNAS_EXIGIDAS.filter(k => idx[k] === undefined);
        if (faltando.length > 0) {
            throw new Error('Coluna não encontrada na tabela: ' + faltando.join(', ') +
                            '. Verifique se a tela de títulos foi alterada.');
        }
        return idx;
    }

    // O campo SCPC fica no cabecalho do cliente. Ha dois <p> com a mesma classe,
    // entao a busca localiza o rotulo "SCPC:" e le o span seguinte.
    function obterValorScpc() {
        const paragrafos = document.querySelectorAll('p.text-sm.text-gray-700.mt-1');
        for (const p of paragrafos) {
            const spans = p.querySelectorAll('span');
            for (let i = 0; i < spans.length; i++) {
                if (spans[i].textContent.trim().toUpperCase() === 'SCPC:') {
                    const valor = spans[i + 1];
                    if (valor) return valor.textContent.trim().toLowerCase();
                }
            }
        }
        return null;
    }

    // ============================================================
    // CLASSIFICACAO
    // ============================================================
    //
    // Funcao pura: mesma entrada, mesma saida. Nao toca no DOM.
    //
    // Ordem de decisao:
    //   1. Posicao CARTORIO no CRM vence qualquer inferencia por data.
    //   2. Antes do prazo-base (1 a 5 dias): atraso inicial.
    //   3. Hoje e a data limite: ultimo dia.
    //   4. Ainda nao chegou na data limite: prazo prorrogado.
    //   5. Passou da data limite: negativado (SCPC) ou verificar posicao (cartorio).
    //
    function classificar(titulo, fluxo, hoje) {
        const { posicao, prazos, diasAtrasoReal, portador } = titulo;

        // posicao já vem em caixa alta (ver coletarRegistros), mas pode
        // chegar acentuada ("CARTÓRIO"); comparamos as duas formas aqui em
        // vez de chamar normalizarTexto() pra não alterar o formato usado
        // no resto da função.
        if (posicao.includes('CARTORIO') || posicao.includes('CARTÓRIO')) return 'EM_CARTORIO';

        if (diasAtrasoReal >= DIAS_ATRASO_MIN && diasAtrasoReal <= DIAS_ATRASO_MAX) {
            return 'EM_ATRASO';
        }

        const comparacao = compararDatas(hoje, prazos.dataLimitePagamento);

        if (comparacao === 0) return 'ULTIMO_DIA';
        if (comparacao < 0) return 'PRAZO_FINAL';

        // Passou do prazo.
        if (fluxo === 'SCPC') return 'NEGATIVADO_SCPC';

        // Fluxo cartorio: o prazo venceu mas o CRM ainda mostra COBRANCA.
        //
        // CORREÇÃO (regra de negócio confirmada pelo usuário): alguns
        // portadores -- Itaú confirmado -- demoram mais de um dia útil pra
        // atualizar a posicaoDescricao pra CARTORIO no sistema, mesmo com o
        // título já protestado de fato. Pra esses portadores, uma vez que o
        // prazo já passou, tratamos como EM_CARTORIO mesmo sem essa
        // confirmação explícita do CRM -- em vez de esperar um dado que,
        // pra esses bancos, sabidamente chega atrasado.
        const portadorNormalizado = normalizarTexto(portador);
        const ehPortadorLentoParaAtualizar = PORTADORES_CARTORIO_LENTO_PARA_ATUALIZAR.some(
            (nome) => portadorNormalizado.includes(nome)
        );
        if (ehPortadorLentoParaAtualizar) return 'EM_CARTORIO';

        // Outros portadores: nao assumimos que foi para cartorio; sinalizamos
        // para conferencia manual.
        return 'VERIFICAR_POSICAO';
    }

    // ============================================================
    // COLETA
    // ============================================================

    function coletarRegistros(hoje) {
        const tabela = localizarTabela();
        if (!tabela) {
            throw new Error('Tabela de títulos não encontrada nesta página.');
        }

        const idx = mapearColunas(tabela);
        const scpc = obterValorScpc();
        const fluxo = scpc === 's' ? 'SCPC' : 'CARTORIO';

        const registros = [];
        const ignorados = [];
        const naoCobrar = [];

        tabela.querySelectorAll('tbody tr').forEach((linha, ordem) => {
            try {
                const celulas = linha.querySelectorAll('td');
                if (celulas.length === 0) return;

                const ler = (chave) =>
                    (celulas[idx[chave]] ? celulas[idx[chave]].textContent.trim() : '');

                const vencimentoTexto = ler('dataVencimento');
                const dataVencimento = converterDataBrasileira(vencimentoTexto);

                if (!dataVencimento) {
                    ignorados.push({ ordem, motivo: 'vencimento ilegível: "' + vencimentoTexto + '"' });
                    return;
                }

                const diasAtrasoReal = diferencaEmDias(hoje, dataVencimento);

                // Titulo a vencer nao entra no relatorio.
                if (diasAtrasoReal < DIAS_ATRASO_MIN) return;

                const diasInformados = extrairDias(ler('diasAtraso'));

                const registro = {
                    linha,
                    ordem,
                    titulo: ler('numeroTitulo'),
                    parcela: ler('sequencia'),
                    // Formato "901968/4" -- mesmo padrão usado na tela de
                    // Promessas, pra permitir cruzar título da promessa
                    // com título da tabela principal.
                    tituloCompleto: ler('numeroTitulo') + '/' + ler('sequencia'),
                    razaoSocial: ler('razaoSocial'),
                    vencimentoTexto,
                    saldoTexto: ler('valorEmAberto'),
                    posicao: ler('posicaoDescricao').toUpperCase(),
                    portador: ler('portadorDescricao'),
                    diasAtrasoReal,
                    diasInformados,
                    // Divergencia entre o que o CRM mostra e o que calculamos aqui.
                    // Costuma indicar dado desatualizado no ERP.
                    divergenciaDias: diasInformados !== null && diasInformados !== diasAtrasoReal,
                    prazos: calcularPrazos(dataVencimento),
                    fluxo
                };

                // SEGURANÇA (bug real reportado pelo usuário: cliente foi
                // cobrado por engano com título marcado "NÃO COBRAR" no CRM).
                // Confirmado no HTML real: "NAO COBRAR" e "CARTEIRA" são
                // valores possíveis de posicaoDescricao (junto de
                // "COBRANCA"/"CARTORIO") -- confirmado com o usuário que
                // AMBOS significam "não cobrar este título". Nunca entram em
                // registros -- ficam de fora do relatório, da mensagem do
                // Alt+A e da nota do Módulo 2, não importa os dias de
                // atraso. Guardados à parte só pra rastreabilidade/aviso
                // visual (ver avisarSeNaoCobrar mais abaixo).
                const posicaoNormalizada = normalizarTexto(registro.posicao);
                const motivoExclusao = POSICOES_EXCLUIDAS_DE_COBRANCA.find((p) => posicaoNormalizada.includes(p));
                if (motivoExclusao) {
                    naoCobrar.push(registro);
                    return;
                }

                registro.situacaoKey = classificar(registro, fluxo, hoje);
                registros.push(registro);

            } catch (erro) {
                ignorados.push({ ordem, motivo: erro.message });
            }
        });

        if (ignorados.length > 0) {
            console.warn('[aviso-cobranca] ' + ignorados.length + ' linha(s) ignorada(s):', ignorados);
        }

        // SEGURANÇA (regra de negócio confirmada pelo usuário): se TODOS os
        // títulos vencidos do cliente já estão em cartório (nenhum em outra
        // situação), não cobramos -- o processo já saiu da cobrança
        // amigável. Mesmo tratamento que NAO COBRAR/CARTEIRA acima: os
        // títulos saem de "registros" e entram em "naoCobrar", disparando o
        // banner fixo (avisarSeNaoCobrar) e tirando o cliente da mensagem
        // automática do Alt+A. Só com 1+ título -- cliente sem nenhum
        // título vencido não teria "registros" mesmo antes desta regra.
        if (registros.length > 0 && registros.every(r => r.situacaoKey === 'EM_CARTORIO')) {
            naoCobrar.push(...registros);
            registros.length = 0;
        }

        const divergentes = registros.filter(r => r.divergenciaDias);
        if (divergentes.length > 0) {
            console.warn('[aviso-cobranca] Divergência entre dias do CRM e dias calculados:',
                divergentes.map(r => ({
                    titulo: r.titulo,
                    crm: r.diasInformados,
                    calculado: r.diasAtrasoReal,
                    vencimento: r.vencimentoTexto
                })));
        }

        return { registros, fluxo, scpc, ignorados, divergentes, naoCobrar };
    }

    // ============================================================
    // DESTAQUE NA TELA
    // ============================================================
    //
    // Usa classe CSS em vez de style inline: a SmartTable recria o tbody ao
    // ordenar ou filtrar. O box-shadow inset desenha o rail sem deslocar o
    // layout de colunas ja calculado pela SmartTable.
    //
    let _estiloInjetado = false;

    function injetarEstilos() {
        if (_estiloInjetado) return;
        _estiloInjetado = true;

        const regras = Object.keys(SITUACOES)
            .filter(k => SITUACOES[k].pintaTela)
            .map(k => {
                const s = SITUACOES[k];
                const cls = '.cob-' + k.toLowerCase();
                return cls + ' > td {' +
                       ' background-color: ' + s.tint + ' !important;' +
                       ' color: ' + s.corTexto + ' !important; }\n' +
                       cls + ' > td:first-child {' +
                       ' box-shadow: inset 3px 0 0 ' + s.rail + '; }';
            })
            .join('\n');

        const estilo = document.createElement('style');
        estilo.id = 'aviso-cobranca-estilos';
        estilo.textContent = regras;
        document.head.appendChild(estilo);
    }

    function limparDestaques(tabela) {
        tabela.querySelectorAll('tbody tr').forEach(tr => {
            tr.className = tr.className.replace(/\bcob-\S+/g, '').trim();
            tr.style.backgroundColor = '';
        });
    }

    function aplicarDestaques(registros) {
        registros.forEach(r => {
            const s = SITUACOES[r.situacaoKey];
            if (s.pintaTela && r.linha && r.linha.isConnected) {
                r.linha.classList.add('cob-' + r.situacaoKey.toLowerCase());
            }
        });
    }

    // A SmartTable recria as linhas em cada ordenacao/filtro, o que apagaria os
    // destaques. O observer reaplica pelo indice da linha.
    let _observer = null;

    function observarTabela(tabela, registros) {
        if (_observer) _observer.disconnect();

        const tbody = tabela.querySelector('tbody');
        if (!tbody) return;

        const porOrdem = new Map(registros.map(r => [r.ordem, r.situacaoKey]));

        _observer = new MutationObserver(() => {
            tbody.querySelectorAll('tr').forEach((tr, i) => {
                const key = porOrdem.get(i);
                if (key && SITUACOES[key].pintaTela) {
                    tr.classList.add('cob-' + key.toLowerCase());
                }
            });
        });

        _observer.observe(tbody, { childList: true });
    }

    // ============================================================
    // RELATORIO
    // ============================================================

    function montarLinhas(registros) {
        return registros.map(r => {
            const s = SITUACOES[r.situacaoKey];
            const celula = 'padding:11px 14px; border-bottom:1px solid ' + TOKENS.divisor +
                           '; color:' + s.corTexto + ';';
            const numerica = celula + ' font-variant-numeric:tabular-nums;';

            // Marcador discreto quando o CRM e o calculo divergem.
            const marca = r.divergenciaDias
                ? ' <span title="Dias informados pelo CRM: ' + r.diasInformados + '" ' +
                  'style="color:' + TOKENS.atencao + '; font-weight:700;">*</span>'
                : '';

            return '<tr style="background:' + s.tint + ';">' +
                // Rail: barra de cor a esquerda. Segundo canal de diferenciacao,
                // legivel mesmo em preto e branco ou sob compressao.
                '<td style="' + celula + ' font-weight:600; border-left:3px solid ' + s.rail + ';">' +
                    esc(r.titulo) + '</td>' +
                '<td style="' + numerica + ' text-align:center;">' + esc(r.parcela) + '</td>' +
                '<td style="' + celula + '">' + esc(r.razaoSocial) + '</td>' +
                '<td style="' + numerica + ' text-align:center;">' + esc(r.vencimentoTexto) + '</td>' +
                '<td style="' + numerica + ' text-align:right;">' + esc(r.saldoTexto) + '</td>' +
                '<td style="' + numerica + ' text-align:center;">' +
                    r.diasAtrasoReal + ' dias' + marca + '</td>' +
                '<td style="' + celula + ' text-align:center;">' +
                    // Badge vazado: contorno + texto no rail. Le melhor que fundo
                    // solido sobre uma linha que ja e colorida.
                    '<span style="display:inline-block; padding:3px 9px; border-radius:3px; ' +
                    'font-size:11.5px; font-weight:700; letter-spacing:0.01em; ' +
                    'border:1px solid ' + s.rail + '; color:' + s.rail + '; ' +
                    'background:rgba(255,255,255,0.55);">' +
                    esc(rotuloDocumento(s, r)) + '</span>' +
                '</td>' +
            '</tr>';
        }).join('');
    }

    function montarLegenda(registros) {
        const usadas = new Set(registros.map(r => r.situacaoKey));

        return Object.keys(SITUACOES)
            .filter(k => usadas.has(k))
            .sort((a, b) => SITUACOES[a].ordem - SITUACOES[b].ordem)
            .map(k => {
                const s = SITUACOES[k];
                return '<div style="display:flex; align-items:center; gap:6px; font-size:11px; ' +
                    'color:' + TOKENS.tinta2 + ';">' +
                    // Amostra reproduz o par tint+rail da linha, nao um quadrado chapado.
                    '<span style="width:16px; height:12px; border-radius:2px; flex-shrink:0; ' +
                    'background:' + s.tint + '; border-left:3px solid ' + s.rail + ';"></span>' +
                    esc(rotuloLegendaDocumento(s)) + '</div>';
            })
            .join('');
    }

    function montarAvisos(registros, fluxo, hoje) {
        // O aviso so aparece quando hoje e de fato o ultimo dia de algum titulo.
        const temUltimoDia = registros.some(r =>
            r.situacaoKey === 'ULTIMO_DIA' && mesmaData(r.prazos.dataLimitePagamento, hoje)
        );
        if (!temUltimoDia) return '';

        const cfg = fluxo === 'SCPC' ? SITUACOES.ULTIMO_DIA.avisoScpc : SITUACOES.ULTIMO_DIA.aviso;
        const corBarra = fluxo === 'SCPC'
            ? SITUACOES.NEGATIVADO_SCPC.rail
            : SITUACOES.ULTIMO_DIA.rail;

        return '<div style="display:flex; gap:10px; margin-top:16px; width:100%; ' +
            'flex-wrap:wrap; box-sizing:border-box;">' +
            '<div style="flex:1; min-width:280px; padding:11px 13px; border:1px solid ' + cfg.borda +
            '; border-left:3px solid ' + corBarra + '; background:' + cfg.fundo +
            '; border-radius:4px; box-sizing:border-box;">' +
                '<div style="font-size:11.5px; font-weight:700; color:' + corBarra +
                '; margin-bottom:4px;">' + esc(cfg.titulo) + '</div>' +
                '<div style="font-size:10.5px; line-height:1.45; color:' + TOKENS.tinta2 + ';">' +
                    esc(cfg.texto) + '</div>' +
            '</div></div>';
    }

    function montarRodape(divergentes) {
        if (divergentes.length === 0) return '';
        return '<div style="margin-top:10px; font-size:10px; color:' + TOKENS.tinta2 + ';">' +
            '<span style="color:' + TOKENS.atencao + '; font-weight:700;">*</span> ' +
            'Dias de atraso calculados a partir da data de vencimento. ' +
            divergentes.length + ' título(s) apresentam contagem diferente da exibida no sistema.' +
            '</div>';
    }

    // Converte texto de moeda em formato brasileiro ("R$ 1.234,56") pra
    // número -- remove separador de milhar (.) e troca a vírgula decimal
    // por ponto. Retorna null se não conseguir reconhecer um número.
    function converterMoedaBrasileira(texto) {
        if (!texto) return null;
        const limpo = String(texto).replace(/[^\d,.-]/g, '').trim();
        if (!limpo) return null;
        const numerico = limpo.replace(/\./g, '').replace(',', '.');
        const valor = parseFloat(numerico);
        return Number.isFinite(valor) ? valor : null;
    }

    function formatarMoedaBrasileira(valor) {
        return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    }

    // Cartão de total: só faz sentido com 2+ títulos (com 1 só, seria igual
    // ao saldo já mostrado na própria linha) -- CONFIRMADO com o usuário.
    function montarTotalizador(registros) {
        if (registros.length <= 1) return '';

        const valores = registros.map(r => converterMoedaBrasileira(r.saldoTexto));
        const semValorReconhecido = valores.filter(v => v === null).length;
        if (semValorReconhecido > 0) {
            console.warn('[aviso-cobranca] ' + semValorReconhecido + ' saldo(s) não reconhecido(s) como valor ' +
                'monetário -- ficaram de fora do Valor Total do relatório.');
        }

        const total = valores.reduce((soma, v) => soma + (v || 0), 0);

        // Cartão de resumo, não uma linha "grudada" na tabela -- mesma
        // linguagem visual do cabeçalho (fundo escuro, texto branco) pra
        // ler como o total de um extrato, não como um dado jogado a mais.
        return '<div style="display:flex; justify-content:space-between; align-items:center; ' +
            'margin-top:12px; padding:9px 16px; background:' + TOKENS.cabecalho + '; ' +
            'border-radius:6px; box-sizing:border-box;">' +
                '<div style="font-size:11px; font-weight:600; letter-spacing:0.03em; ' +
                'color:rgba(255,255,255,0.7); text-transform:uppercase;">' +
                    registros.length + ' títulos vencidos</div>' +
                '<div style="text-align:right;">' +
                    '<div style="font-size:10px; font-weight:600; letter-spacing:0.03em; ' +
                    'color:rgba(255,255,255,0.7); text-transform:uppercase; margin-bottom:1px;">' +
                        'Valor total</div>' +
                    '<div style="font-size:16px; font-weight:700; color:#FFFFFF; ' +
                    'font-variant-numeric:tabular-nums;">' +
                        esc(formatarMoedaBrasileira(total)) + '</div>' +
                '</div>' +
            '</div>';
    }

    function montarRelatorio(dados, hoje) {
        const { registros, fluxo, divergentes } = dados;

        const dataHora = new Date().toLocaleString('pt-BR', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });

        const th = 'padding:11px 14px; color:#FFFFFF; font-weight:600; font-size:11.5px;';

        return '<div style="width:900px; font-family:-apple-system,\'Segoe UI\',Arial,sans-serif; ' +
            'background:' + TOKENS.papel + '; padding:32px; box-sizing:border-box; ' +
            'color:' + TOKENS.tinta + ';">' +

            // CABECALHO
            '<div style="display:flex; justify-content:space-between; align-items:flex-end; ' +
            'border-bottom:2px solid ' + TOKENS.cabecalho + '; padding-bottom:16px; ' +
            'margin-bottom:22px;">' +
                '<div>' +
                    '<div style="font-size:21px; font-weight:700; color:' + TOKENS.tinta +
                    '; letter-spacing:-0.2px;">Relatório</div>' +
                    '<div style="font-size:13px; color:' + TOKENS.tinta2 + '; margin-top:4px;">' +
                        'Títulos vencidos em aberto</div>' +
                '</div>' +
                '<div style="font-size:12px; color:' + TOKENS.tinta2 + '; text-align:right;">' +
                    'Gerado em<br>' +
                    '<strong style="color:' + TOKENS.tinta + '; font-variant-numeric:tabular-nums;">' +
                    dataHora + '</strong></div>' +
            '</div>' +

            // TABELA
            '<table style="width:100%; border-collapse:collapse; font-size:13px;">' +
                '<thead><tr style="background:' + TOKENS.cabecalho + ';">' +
                    '<th style="' + th + ' text-align:left;">Título</th>' +
                    '<th style="' + th + ' text-align:center;">Parcela</th>' +
                    '<th style="' + th + ' text-align:left;">Cliente</th>' +
                    '<th style="' + th + ' text-align:center;">Vencimento</th>' +
                    '<th style="' + th + ' text-align:right;">Saldo</th>' +
                    '<th style="' + th + ' text-align:center;">Atraso</th>' +
                    '<th style="' + th + ' text-align:center;">Situação</th>' +
                '</tr></thead>' +
                '<tbody>' + montarLinhas(registros) + '</tbody>' +
            '</table>' +

            montarTotalizador(registros) +

            // LEGENDA
            '<div style="display:flex; gap:16px; margin-top:14px; padding:10px 12px; ' +
            'background:' + TOKENS.superficie + '; border-radius:4px; flex-wrap:wrap;">' +
                montarLegenda(registros) + '</div>' +

            montarAvisos(registros, fluxo, hoje) +
            montarRodape(divergentes) +

        '</div>';
    }

    // ============================================================
    // EXPORTACAO
    // ============================================================

    let _html2canvas = null;

    // Singleton: sem isso, clicar antes do preload terminar injeta um segundo script.
    function carregarHtml2Canvas() {
        if (typeof html2canvas !== 'undefined') return Promise.resolve(window.html2canvas);
        if (_html2canvas) return _html2canvas;

        _html2canvas = new Promise((resolver, rejeitar) => {
            const script = document.createElement('script');
            script.src = HTML2CANVAS_URL;
            script.onload = () => resolver(window.html2canvas);
            script.onerror = () => {
                _html2canvas = null;
                rejeitar(new Error('Não foi possível carregar a biblioteca de captura. ' +
                                   'Verifique a conexão.'));
            };
            document.head.appendChild(script);
        });
        return _html2canvas;
    }

    function gerarNomeArquivo() {
        const agora = new Date();
        const p = n => String(n).padStart(2, '0');
        return 'relatorio-cobranca-' +
               agora.getFullYear() + p(agora.getMonth() + 1) + p(agora.getDate()) + '-' +
               p(agora.getHours()) + p(agora.getMinutes()) + '.png';
    }

    async function capturarEExportar(html) {
        const lib = await carregarHtml2Canvas();

        const container = document.createElement('div');
        container.innerHTML = html;
        Object.assign(container.style, { position: 'fixed', top: '-9999px', left: '-9999px' });
        document.body.appendChild(container);

        try {
            const canvas = await lib(container, { backgroundColor: TOKENS.papel, scale: 2 });
            const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
            if (!blob) throw new Error('Falha ao converter o relatório em imagem.');

            let copiado = false;
            if (navigator.clipboard && window.ClipboardItem) {
                try {
                    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
                    copiado = true;
                } catch (erro) {
                    console.warn('[aviso-cobranca] Cópia para a área de transferência falhou:', erro);
                }
            }

            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.download = gerarNomeArquivo();
            link.href = url;
            document.body.appendChild(link);
            link.click();
            link.remove();
            // Revogar de imediato pode abortar o download em alguns navegadores.
            setTimeout(() => URL.revokeObjectURL(url), 10000);

            return { copiado };
        } finally {
            container.remove();
        }
    }

        // ============================================================
    // FEEDBACK
    // ============================================================

    let _toastAtual = null;

    function notificar(mensagem, tipo) {
        // Se a pagina tiver seu proprio sistema de toast, aproveita ele.
        if (typeof window.showToast === 'function') {
            window.showToast(mensagem, tipo);
            return;
        }
        exibirToastProprio(mensagem, tipo);
    }

    // Aviso proprio, nao bloqueante: aparece e some sozinho. Nunca usa alert(),
    // que trava a tela ate o usuario clicar e era a causa da lentidao percebida.
    function exibirToastProprio(mensagem, tipo) {
        // Remove um toast anterior ainda visivel, para nao empilhar varios.
        if (_toastAtual) {
            clearTimeout(_toastAtual._timer);
            _toastAtual.remove();
            _toastAtual = null;
        }

        const cores = tipo === 'error'
            ? { fundo: '#FDF3F1', borda: '#E8C7BE', texto: '#8A2A16' }
            : { fundo: '#EFF6F1', borda: '#B9D9C4', texto: '#1B6B4A' };

        const toast = document.createElement('div');
        toast.textContent = mensagem;
        Object.assign(toast.style, {
            position: 'fixed', bottom: '78px', right: '20px', zIndex: '999999',
            maxWidth: '360px', padding: '12px 16px', borderRadius: '8px',
            background: cores.fundo, border: '1px solid ' + cores.borda, color: cores.texto,
            fontSize: '13px', fontFamily: '-apple-system, Segoe UI, Arial, sans-serif',
            boxShadow: '0 4px 14px rgba(21,26,33,0.18)', lineHeight: '1.4',
            opacity: '0', transition: 'opacity 180ms ease-out'
        });
        document.body.appendChild(toast);
        requestAnimationFrame(() => { toast.style.opacity = '1'; });

        const tempoVisivel = tipo === 'error' ? 6000 : 3500;
        toast._timer = setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 200);
            if (_toastAtual === toast) _toastAtual = null;
        }, tempoVisivel);

        _toastAtual = toast;
    }

    // ============================================================
    // ORQUESTRACAO
    // ============================================================

    async function gerarRelatorio() {
        const hoje = normalizarData(new Date());
        const dados = coletarRegistros(hoje);

        if (dados.registros.length === 0) {
            throw new Error('Nenhum título vencido encontrado para este cliente.');
        }

        const tabela = localizarTabela();
        injetarEstilos();
        limparDestaques(tabela);
        aplicarDestaques(dados.registros);
        observarTabela(tabela, dados.registros);

        const html = montarRelatorio(dados, hoje);
        const resultado = await capturarEExportar(html);

        return {
            total: dados.registros.length,
            copiado: resultado.copiado,
            divergentes: dados.divergentes.length,
            ignorados: dados.ignorados.length
        };
    }

    async function aoClicar(evento) {
        const botao = evento.currentTarget;
        const rotulo = botao.textContent;

        botao.disabled = true;
        botao.style.opacity = '0.6';
        botao.style.cursor = 'wait';
        botao.textContent = 'Gerando...';

        try {
            const r = await gerarRelatorio();

            let msg = r.total + ' título(s) no relatório. ';
            msg += r.copiado ? 'Imagem copiada e baixada.' : 'Imagem baixada.';
            if (r.divergentes > 0) {
                msg += ' ' + r.divergentes + ' com contagem divergente do sistema.';
            }
            notificar(msg, 'success');

        } catch (erro) {
            console.error('[aviso-cobranca]', erro);
            notificar(erro.message || 'Não foi possível gerar o relatório.', 'error');

        } finally {
            botao.disabled = false;
            botao.style.opacity = '';
            botao.style.cursor = 'pointer';
            botao.textContent = rotulo;
        }
    }

       // ============================================================
    // INSTALACAO
    // ============================================================

    let _observerInstalacao = null;

    // Banner fixo, SEM botão de fechar -- de propósito. O bug que motivou
    // isso foi justamente cobrar por falta de atenção; um aviso que dá pra
    // fechar e esquecer não protege contra isso.
    //
    // PEDIDO DO USUÁRIO (prévia visual aprovada antes de aplicar): mesma
    // urgência (vermelho, sem botão de fechar), mas com hierarquia melhor
    // -- selo com ícone, título curto em destaque, detalhe secundário --
    // em vez de uma única frase corrida em negrito.
    function avisarSeNaoCobrar() {
        if (document.getElementById('aviso-nao-cobrar-banner')) return; // já existe, não duplica

        let dados;
        try {
            dados = coletarRegistros(normalizarData(new Date()));
        } catch (erro) {
            return; // sem tabela ainda ou erro -- não é o momento de travar nada por isso
        }

        if (!dados.naoCobrar || dados.naoCobrar.length === 0) return;

        const banner = document.createElement('div');
        banner.id = 'aviso-nao-cobrar-banner';
        Object.assign(banner.style, {
            position: 'fixed',
            top: '0',
            left: '0',
            right: '0',
            zIndex: 999998,
            background: 'linear-gradient(180deg, #2A1414 0%, #1F0F0F 100%)',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
            boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
            display: 'flex',
            alignItems: 'center',
            gap: '14px',
            padding: '14px 22px',
            fontFamily: '-apple-system, Segoe UI, Arial, sans-serif',
        });

        const selo = document.createElement('div');
        Object.assign(selo.style, {
            flexShrink: '0',
            width: '36px',
            height: '36px',
            borderRadius: '10px',
            background: '#DC2626',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 0 0 4px rgba(220,38,38,0.18)',
        });
        // Ícone estático (sem dado dinâmico interpolado) -- seguro usar
        // innerHTML aqui, diferente do texto dos títulos abaixo (nomes de
        // posição vêm do CRM e continuam usando nós de texto).
        selo.innerHTML =
            '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" ' +
            'stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/>' +
            '<line x1="6.5" y1="6.5" x2="17.5" y2="17.5"/></svg>';

        const corpo = document.createElement('div');
        corpo.style.lineHeight = '1.35';

        const titulo = document.createElement('div');
        titulo.textContent = 'Não cobrar este cliente';
        Object.assign(titulo.style, {
            fontSize: '13px',
            fontWeight: '700',
            letterSpacing: '.04em',
            color: '#FCA5A5',
            textTransform: 'uppercase',
            marginBottom: '2px',
        });

        // Nós de texto reais, sem innerHTML -- mesmo padrão de segurança já
        // usado no Módulo 5 (item A1): tituloCompleto/posicao vêm do CRM.
        const detalhe = document.createElement('div');
        detalhe.style.fontSize = '14px';
        detalhe.style.color = '#F1E4E4';
        detalhe.append('Título(s) ');
        dados.naoCobrar.forEach((r, i) => {
            if (i > 0) detalhe.append(', ');
            const destaque = document.createElement('b');
            destaque.style.color = '#fff';
            destaque.style.fontWeight = '600';
            destaque.textContent = `${r.tituloCompleto} (${r.posicao})`;
            detalhe.appendChild(destaque);
        });
        detalhe.append(' -- não entre em contato de cobrança sobre ele(s).');

        corpo.appendChild(titulo);
        corpo.appendChild(detalhe);
        banner.appendChild(selo);
        banner.appendChild(corpo);

        document.body.appendChild(banner);
    }

    function criarBotao() {
        // Evita duplicar se, por algum motivo, a instalacao rodar duas vezes.
        if (document.getElementById('aviso-cobranca-botao')) return;

        const botao = document.createElement('button');
        botao.id = 'aviso-cobranca-botao';
        botao.type = 'button';
        botao.textContent = 'Gerar Relatório';
        Object.assign(botao.style, {
            position: 'fixed', bottom: '20px', right: '20px', zIndex: '999999',
            padding: '12px 20px', background: TOKENS.cabecalho, color: '#FFFFFF',
            border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '600',
            cursor: 'pointer', boxShadow: '0 4px 12px rgba(21,26,33,0.25)',
            fontFamily: '-apple-system, Segoe UI, Arial, sans-serif'
        });
        botao.onmouseenter = () => { if (!botao.disabled) botao.style.background = '#22394D'; };
        botao.onmouseleave = () => { if (!botao.disabled) botao.style.background = TOKENS.cabecalho; };
        botao.addEventListener('click', aoClicar);

        document.body.appendChild(botao);

        // Aquece a biblioteca em segundo plano; erro aqui e silencioso porque o
        // clique volta a tentar e ai sim reporta ao operador.
        carregarHtml2Canvas().catch(() => {});
    }

    // A tabela de titulos e montada por OUTRO script (o que chama
    // "new SmartTable('#tabela-titulos-ds', ...)"), que roda DEPOIS deste
    // arquivo no carregamento da pagina. Se checarmos so uma vez no
    // DOMContentLoaded, corremos o risco de checar ANTES da tabela existir e
    // desistir para sempre. Por isso observamos o DOM ate ela aparecer.
    function aguardarTabelaEInstalar() {
        if (_observerInstalacao) return; // ja esta observando, nao duplica

        _observerInstalacao = new MutationObserver(() => {
            if (localizarTabela()) {
                _observerInstalacao.disconnect();
                _observerInstalacao = null;
                criarBotao();
                avisarSeNaoCobrar();
            }
        });
        _observerInstalacao.observe(document.body, { childList: true, subtree: true });

        // Rede de seguranca: em paginas do CRM que nunca vao ter essa tabela
        // (Dashboard, Negociacoes, etc.), para de observar apos 20s em vez de
        // ficar rodando para sempre.
        setTimeout(() => {
            if (_observerInstalacao) {
                _observerInstalacao.disconnect();
                _observerInstalacao = null;
            }
        }, 20000);
    }

    function instalarBotao() {
        if (!document.body) {
            setTimeout(instalarBotao, 100);
            return;
        }

        if (localizarTabela()) {
            criarBotao();
            avisarSeNaoCobrar();
        } else {
            aguardarTabelaEInstalar();
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', instalarBotao);
    } else {
        instalarBotao();
    }

    // Exposto para conferencia manual pelo console, sem gerar imagem.
      window.__avisoCobranca = {
        simular: () => coletarRegistros(normalizarData(new Date())),
        prazosDe: (dataBr) => calcularPrazos(converterDataBrasileira(dataBr)),
        feriados: (ano) => Array.from(feriadosDoAno(ano)).sort(),
        tokens: TOKENS,
        situacoes: SITUACOES,
        instalarBotao: instalarBotao   // <-- linha nova
    };

})();
// ===== FIM - Aviso de Cobranca (v4) =====

/* Phetsiam site runtime: renders the page template with the page logic and patches the DOM on state changes. */
(function () {
  'use strict';
  function DCLogic() { this.props = {}; this.state = undefined; }
  DCLogic.prototype.setState = function (o) { this.state = Object.assign({}, this.state || {}, o); schedule(); };
  DCLogic.prototype.forceUpdate = function () { schedule(); };

  var src = document.getElementById('dc-logic').textContent;
  var Component = new Function('DCLogic', src + '\n;return Component')(DCLogic);
  var inst = new Component();
  inst.props = {};
  var tplHtml = document.getElementById('dc-tpl').innerHTML;
  var app = document.getElementById('app');

  function lookup(scopes, p) {
    p = p.trim();
    if (p === 'true') return true;
    if (p === 'false') return false;
    var parts = p.split('.');
    for (var i = 0; i < scopes.length; i++) {
      var s = scopes[i];
      if (s && parts[0] in s) {
        var v = s;
        for (var j = 0; j < parts.length; j++) { if (v == null) return undefined; v = v[parts[j]]; }
        return v;
      }
    }
    return undefined;
  }
  var HOLE = /\{\{([^}]+)\}\}/g;
  function interp(str, scopes) { return str.replace(HOLE, function (m, p) { var v = lookup(scopes, p); return v == null ? '' : String(v); }); }

  function walk(node, scopes) {
    if (node.nodeType === 3) { if (node.nodeValue.indexOf('{{') >= 0) node.nodeValue = interp(node.nodeValue, scopes); return; }
    if (node.nodeType !== 1) return;
    var tag = node.tagName.toLowerCase();
    if (tag === 'sc-if') {
      var ok = lookup(scopes, node.getAttribute('value').replace(/[{}]/g, ''));
      if (!ok) { node.parentNode.removeChild(node); return; }
      var kids = Array.prototype.slice.call(node.childNodes);
      kids.forEach(function (k) { node.parentNode.insertBefore(k, node); });
      node.parentNode.removeChild(node);
      kids.forEach(function (k) { walk(k, scopes); });
      return;
    }
    if (tag === 'sc-for') {
      var list = lookup(scopes, node.getAttribute('list').replace(/[{}]/g, '')) || [];
      var as = node.getAttribute('as');
      var proto = Array.prototype.slice.call(node.childNodes);
      var made = [];
      list.forEach(function (item, i) {
        var sc = {}; sc[as] = item; sc.$index = i;
        proto.forEach(function (k) { var c = k.cloneNode(true); node.parentNode.insertBefore(c, node); made.push([c, [sc].concat(scopes)]); });
      });
      node.parentNode.removeChild(node);
      made.forEach(function (m) { walk(m[0], m[1]); });
      return;
    }
    Array.prototype.slice.call(node.attributes).forEach(function (a) {
      if (a.value.indexOf('{{') < 0) return;
      var whole = a.value.match(/^\{\{([^}]+)\}\}$/);
      if (whole) {
        var v = lookup(scopes, whole[1]);
        if (typeof v === 'function') {
          node.removeAttribute(a.name);
          var ev = a.name.toLowerCase().replace(/^on/, '');
          if (ev === 'change' && (tag === 'input' || tag === 'textarea')) ev = 'input';
          node._on = node._on || {};
          node._on[ev] = v;
        } else if (v === false || v == null) node.removeAttribute(a.name);
        else node.setAttribute(a.name, v === true ? 'true' : String(v));
      } else node.setAttribute(a.name, interp(a.value, scopes));
    });
    Array.prototype.slice.call(node.childNodes).forEach(function (k) { walk(k, scopes); });
  }

  function build() {
    var t = document.createElement('template');
    t.innerHTML = tplHtml;
    var frag = document.importNode(t.content, true);
    var holder = document.createElement('div');
    holder.appendChild(frag);
    walk(holder, [inst.renderVals()]);
    return holder;
  }

  function patchChildren(a, b) {
    var ac = Array.prototype.slice.call(a.childNodes), bc = Array.prototype.slice.call(b.childNodes);
    for (var i = 0; i < bc.length; i++) { if (i < ac.length) patch(ac[i], bc[i]); else a.appendChild(bc[i]); }
    for (var k = bc.length; k < ac.length; k++) a.removeChild(ac[k]);
  }
  function patch(a, b) {
    if (a.nodeType !== b.nodeType || (a.nodeType === 1 && a.tagName !== b.tagName)) { a.parentNode.replaceChild(b, a); return; }
    if (a.nodeType !== 1) { if (a.nodeValue !== b.nodeValue) a.nodeValue = b.nodeValue; return; }
    var revealed = a.hasAttribute('data-rv') && a.classList.contains('in');
    Array.prototype.slice.call(a.attributes).forEach(function (at) {
      if (!b.hasAttribute(at.name) && !(at.name === 'open' && a.tagName === 'DETAILS')) a.removeAttribute(at.name);
    });
    Array.prototype.slice.call(b.attributes).forEach(function (at) { if (a.getAttribute(at.name) !== at.value) a.setAttribute(at.name, at.value); });
    if (revealed) a.classList.add('in');
    a._on = b._on;
    if (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA') {
      var v = b.getAttribute('value') || '';
      if (a.value !== v && document.activeElement !== a) a.value = v;
      return;
    }
    patchChildren(a, b);
  }

  ['click', 'input', 'change', 'submit'].forEach(function (type) {
    app.addEventListener(type, function (e) {
      var n = e.target;
      while (n && n !== app) {
        if (n._on && n._on[type]) { n._on[type](e); return; }
        n = n.parentNode;
      }
    });
  });

  var mounted = false, queued = false;
  function render() {
    queued = false;
    var fresh = build();
    if (!mounted) {
      while (fresh.firstChild) app.appendChild(fresh.firstChild);
      mounted = true;
      if (inst.componentDidMount) inst.componentDidMount();
    } else {
      patchChildren(app, fresh);
      if (inst.componentDidUpdate) inst.componentDidUpdate();
    }
  }
  function schedule() { if (!mounted || queued) return; queued = true; Promise.resolve().then(render); }
  render();
})();

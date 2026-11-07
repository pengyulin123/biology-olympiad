/* =========================================================
   编辑模式
   - 密码解锁（仅防误触，不是权限控制）
   - 知识点：改标题 / 星级 / 正文，新增、删除
   - 术语：改中文 / 英文 / 释义
   - 页面文案：编辑模式下直接点文字改
   所有修改保存在本机 localStorage，可导出 JSON
   ========================================================= */
(function () {
  "use strict";

  var PWD = "pengyulin";
  var SKEY = "biolab.pwd.session";
  var TKEY = "biolab.text.v1";
  var MEM = {};
  var unlocked = false;
  var editing = false;

  function lsGet(k) {
    try { var v = localStorage.getItem(k); if (v !== null) return v; } catch (e) {}
    return MEM[k] || null;
  }
  function lsSet(k, v) {
    try { localStorage.setItem(k, v); } catch (e) {}
    MEM[k] = v;
  }
  function ssGet(k) { try { return sessionStorage.getItem(k); } catch (e) { return MEM["s_" + k] || null; } }
  function ssSet(k, v) { try { sessionStorage.setItem(k, v); } catch (e) {} MEM["s_" + k] = v; }

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  /* 当前视图 / 页面标识（单文件版与多页版通用） */
  function scopeEl() {
    var v = document.querySelector(".view.active");
    return v || document.querySelector("main") || document.body;
  }
  function pageId() {
    var v = document.querySelector(".view.active");
    if (v) return v.id.replace(/^view-/, "");
    var f = (location.pathname.split("/").pop() || "index.html").replace(/\.html?$/, "");
    return f || "index";
  }

  /* ---------- 文案层 ---------- */
  function readTexts() {
    var base = window.KG_TEXTS || {};
    var local = {};
    try { local = JSON.parse(lsGet(TKEY) || "{}"); } catch (e) {}
    var out = {};
    var k;
    for (k in base) if (Object.prototype.hasOwnProperty.call(base, k)) out[k] = base[k];
    for (k in local) if (Object.prototype.hasOwnProperty.call(local, k)) out[k] = local[k];
    return out;
  }
  function saveText(k, v) {
    var o = readTexts();
    o[k] = v;
    lsSet(TKEY, JSON.stringify(o));
  }

  function textEls() {
    var root = scopeEl();
    var all = root.querySelectorAll("h1,h2,h3,h4,p,li,td,th,span.tag,div.lead");
    var out = [];
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      if (el.querySelector && el.querySelector("button,input,select,textarea,table,div")) continue;
      if (!el.textContent.trim()) continue;
      out.push(el);
    }
    return out;
  }

  function safeHTML(html) {
    var box = document.createElement("div");
    box.innerHTML = html;
    var bad = box.querySelectorAll("script,iframe,object,embed,style,link");
    for (var i = 0; i < bad.length; i++) bad[i].remove();
    var all = box.querySelectorAll("*");
    for (var j = 0; j < all.length; j++) {
      var e = all[j];
      for (var k = e.attributes.length - 1; k >= 0; k--) {
        var n = e.attributes[k].name;
        if (/^on/i.test(n) || n === "srcdoc") e.removeAttribute(n);
      }
    }
    return box.innerHTML;
  }

  function applyTexts() {
    var o = readTexts();
    var page = pageId();
    var els = textEls();
    for (var i = 0; i < els.length; i++) {
      var v = o[page + "|" + i];
      if (v != null) els[i].innerHTML = safeHTML(v);
    }
  }

  function bindTextEdit(on) {
    var els = textEls();
    var page = pageId();
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (on) {
        el.setAttribute("contenteditable", "true");
        el.setAttribute("data-tkey", page + "|" + i);
        el.addEventListener("blur", onBlur);
      } else {
        el.removeAttribute("contenteditable");
        el.removeAttribute("data-tkey");
        el.removeEventListener("blur", onBlur);
      }
    }
  }
  function onBlur(e) {
    var k = this.getAttribute("data-tkey");
    if (!k) return;
    var v = this.innerHTML.trim();
    if (v && this.textContent.trim()) saveText(k, v);
  }

  /* ---------- UI 构建 ---------- */
  function buildUI() {
    if ($("editFab")) return;

    var fab = document.createElement("button");
    fab.className = "edit-fab";
    fab.id = "editFab";
    fab.title = "编辑";
    fab.textContent = "✎";
    document.body.appendChild(fab);

    var bar = document.createElement("div");
    bar.className = "edit-bar";
    bar.id = "editBar";
    bar.innerHTML =
      '<span class="lbl" id="editStat">编辑模式</span>' +
      '<button class="btn" id="btnAddItem">＋条目</button>' +
      '<button class="btn" id="btnExport">导出</button>' +
      '<button class="btn" id="btnImport">导入</button>' +
      '<button class="btn" id="btnReset" style="color:var(--rose)">还原</button>' +
      '<span class="sp"></span>' +
      '<button class="btn" id="btnExit">退出</button>';
    document.body.appendChild(bar);

    // 密码弹窗
    var pm = document.createElement("div");
    pm.className = "modal";
    pm.id = "pwdModal";
    pm.innerHTML =
      '<div class="modal-mask" data-close="1"></div>' +
      '<div class="modal-box">' +
      '<h3>进入编辑模式</h3>' +
      '<p class="faint">解锁后可以修改知识点、术语和页面文字。修改保存在本机浏览器，不会影响其他人。</p>' +
      '<div class="field" style="margin-top:14px"><label>密码</label>' +
      '<input type="password" id="pwdInput" placeholder="输入密码" autocomplete="off"></div>' +
      '<p class="faint" id="pwdErr" style="color:var(--rose);display:none;margin:0">密码不对</p>' +
      '<div class="modal-actions"><button class="btn" id="pwdCancel">取消</button>' +
      '<button class="btn btn-primary" id="pwdOk">解锁</button></div>' +
      '<p class="faint" style="margin-top:14px;font-size:11.5px;line-height:1.7">' +
      "注意：这是纯静态网页，密码写在前端代码里，只能防止误改，挡不住懂技术的人。真正的权限控制需要服务器。</p>" +
      "</div>";
    document.body.appendChild(pm);

    // 表单弹窗
    var fm = document.createElement("div");
    fm.className = "modal";
    fm.id = "formModal";
    fm.innerHTML =
      '<div class="modal-mask" data-close="1"></div>' +
      '<div class="modal-box">' +
      '<h3 id="formTitle">编辑</h3>' +
      '<div id="formBody"></div>' +
      '<div class="modal-actions"><button class="btn" id="formCancel">取消</button>' +
      '<button class="btn btn-primary" id="formSave">保存</button></div>' +
      "</div>";
    document.body.appendChild(fm);

    // 隐藏的文件选择
    var fi = document.createElement("input");
    fi.type = "file";
    fi.accept = ".json,application/json";
    fi.style.display = "none";
    fi.id = "importFile";
    document.body.appendChild(fi);

    bindUI();
  }

  function bindUI() {
    $("editFab").addEventListener("click", function () {
      if (!unlocked) { openPwd(); return; }
      setEditing(!editing);
    });

    $("pwdCancel").addEventListener("click", closePwd);
    $("pwdOk").addEventListener("click", tryPwd);
    $("pwdInput").addEventListener("keydown", function (e) {
      if (e.key === "Enter") tryPwd();
    });
    document.querySelectorAll('#pwdModal [data-close]').forEach(function (el) {
      el.addEventListener("click", closePwd);
    });

    $("formCancel").addEventListener("click", closeForm);
    document.querySelectorAll('#formModal [data-close]').forEach(function (el) {
      el.addEventListener("click", closeForm);
    });

    $("btnExit").addEventListener("click", function () {
      setEditing(false);
      unlocked = false;
      ssSet(SKEY, "0");
      toast("已退出编辑模式");
    });

    $("btnAddItem").addEventListener("click", openAddForm);
    $("btnExport").addEventListener("click", doExport);
    $("btnImport").addEventListener("click", function () { $("importFile").click(); });
    $("importFile").addEventListener("change", doImport);
    $("btnReset").addEventListener("click", doReset);

    // 术语编辑（事件委托）
    document.addEventListener("click", function (e) {
      var el = e.target.closest ? e.target.closest(".term-edit") : null;
      if (!el || !editing) return;
      e.preventDefault();
      e.stopPropagation();
      openTermForm(parseInt(el.getAttribute("data-ti"), 10));
    });
  }

  function toast(msg) {
    var t = document.createElement("div");
    t.textContent = msg;
    t.style.cssText = "position:fixed;left:50%;top:18%;transform:translateX(-50%);z-index:200;" +
      "background:rgba(10,22,19,.96);border:1px solid rgba(33,230,166,.4);color:#21e6a6;" +
      "padding:10px 18px;border-radius:11px;font-size:13.5px;box-shadow:0 10px 30px rgba(0,0,0,.5)";
    document.body.appendChild(t);
    setTimeout(function () { t.style.opacity = "0"; t.style.transition = ".3s"; }, 1400);
    setTimeout(function () { t.remove(); }, 1800);
  }

  /* ---------- 密码 ---------- */
  function openPwd() {
    $("pwdModal").classList.add("on");
    $("pwdErr").style.display = "none";
    $("pwdInput").value = "";
    setTimeout(function () { $("pwdInput").focus(); }, 80);
  }
  function closePwd() { $("pwdModal").classList.remove("on"); }
  function tryPwd() {
    var v = $("pwdInput").value;
    if (v === PWD) {
      unlocked = true;
      ssSet(SKEY, "1");
      closePwd();
      setEditing(true);
    } else {
      $("pwdErr").style.display = "block";
      $("pwdInput").value = "";
      $("pwdInput").focus();
    }
  }

  /* ---------- 编辑模式开关 ---------- */
  function setEditing(on) {
    editing = on;
    document.body.classList.toggle("editing", on);
    $("editBar").classList.toggle("on", on);
    $("editFab").classList.toggle("on", on);
    bindTextEdit(on);
    updateStat();
    if (window.KGAPI) {
      $("btnAddItem").style.display = on ? "" : "none";
      if (on) window.KGAPI.refreshAll();
    } else if (on) {
      $("btnAddItem").style.display = "none";
    }
  }

  function updateStat() {
    var el = $("editStat");
    if (!el) return;
    if (!window.KGAPI) { el.textContent = "文案编辑"; return; }
    var s = window.KGAPI.stats();
    el.textContent = "改" + (s.items + s.terms) + " · 增" + (s.added + (s.ch || 0)) + " · 删" + s.removed;
  }

  /* ---------- 表单 ---------- */
  var formSaveHandler = null;

  function openForm(title, bodyHTML, onSave) {
    $("formTitle").textContent = title;
    $("formBody").innerHTML = bodyHTML;
    $("formModal").classList.add("on");
    formSaveHandler = onSave;
    $("formSave").onclick = function () {
      if (formSaveHandler) formSaveHandler();
    };
  }
  function closeForm() {
    $("formModal").classList.remove("on");
    formSaveHandler = null;
  }

  /* 条目编辑（由 kg.js 在打开弹窗时调用） */
  window.EDIT_ON_SHEET = function (bookId, it) {
    if (!editing || !window.KGAPI) return;
    var head = document.querySelector(".sheet-head");
    if (!head) return;
    var old = document.getElementById("sheetEditBtns");
    if (old) old.remove();
    var box = document.createElement("div");
    box.id = "sheetEditBtns";
    box.style.cssText = "display:flex;gap:6px;margin-top:10px";
    box.innerHTML =
      '<button class="btn btn-sm" id="sheetEdit">编辑本条</button>' +
      '<button class="btn btn-sm" id="sheetDel" style="color:var(--rose)">删除</button>';
    head.querySelector(".sheet-title").appendChild(box);
    $("sheetEdit").addEventListener("click", function () { openItemForm(bookId, it, "edit"); });
    $("sheetDel").addEventListener("click", function () {
      if (!confirm("删除《" + it.t + "》？\n删除只在本机生效，可以用「还原」恢复。")) return;
      window.KGAPI.removeItem(bookId, it.id);
      document.getElementById("sheet").classList.remove("on");
      document.body.style.overflow = "";
      toast("已删除");
    });
  };

  function openItemForm(bookId, it, mode) {
    var isEdit = mode === "edit";
    var body =
      '<div class="field"><label>标题</label><input id="fT" value="' + esc(it ? it.t : "") + '"></div>' +
      '<div class="field-row">' +
      '<div class="field"><label>编号</label><input id="fId" value="' + esc(it ? it.id : "") + '"' +
      (isEdit ? ' readonly style="opacity:.6"' : "") + "></div>" +
      '<div class="field"><label>星级</label><select id="fS">' +
      '<option value="3"' + (it && it.s === 3 ? " selected" : "") + ">★★★</option>" +
      '<option value="2"' + (it && it.s === 2 ? " selected" : "") + ">★★</option>" +
      '<option value="1"' + (it && it.s === 1 ? " selected" : "") + ">★</option></select></div>" +
      "</div>" +
      '<div class="field"><label>正文</label><textarea id="fX">' + esc(it ? it.x || "" : "") + "</textarea></div>";

    openForm(isEdit ? "编辑知识点" : "新增知识点", body, function () {
      var t = $("fT").value.trim();
      var x = $("fX").value.trim();
      var s = parseInt($("fS").value, 10);
      if (!t) { alert("标题不能为空"); return; }
      if (isEdit) {
        window.KGAPI.editItem(bookId, it.id, { t: t, s: s, x: x });
        closeForm();
        toast("已保存");
        if (window.KG_RELOAD_SHEET) window.KG_RELOAD_SHEET();
      } else {
        var id = $("fId").value.trim();
        if (!id) { alert("编号不能为空，格式如 3.4"); return; }
        window.KGAPI.addItem({
          book: bookId, ch: parseInt(currAdd.ch, 10), chTitle: currAdd.chTitle,
          id: id, t: t, s: s, x: x
        });
        closeForm();
        toast("已新增");
      }
      updateStat();
    });
  }

  var currAdd = { ch: 1, chTitle: "" };

  function openAddForm() {
    if (!window.KGAPI || !window.KG_INDEX) return;
    var opts = "";
    window.KG_INDEX.forEach(function (b) {
      opts += '<option value="' + b.id + '">' + b.id + " " + esc(b.name) + "</option>";
    });
    var body =
      '<div class="field"><label>所属册</label><select id="fBook">' + opts + "</select></div>" +
      '<div class="field-row">' +
      '<div class="field"><label>章号</label><input id="fCh" type="number" value="1"></div>' +
      '<div class="field"><label>章名（可留空）</label><input id="fChName" placeholder="如 糖类化学"></div>' +
      "</div>" +
      '<div class="field-row">' +
      '<div class="field"><label>条目编号</label><input id="fId" placeholder="如 3.13"></div>' +
      '<div class="field"><label>星级</label><select id="fS">' +
      '<option value="3">★★★</option><option value="2">★★</option><option value="1">★</option></select></div>' +
      "</div>" +
      '<div class="field"><label>标题</label><input id="fT" placeholder="这个知识点叫什么"></div>' +
      '<div class="field"><label>正文</label><textarea id="fX" placeholder="支持纯文本，换行会分段"></textarea></div>';

    openForm("新增知识点", body, function () {
      var book = $("fBook").value;
      var ch = parseInt($("fCh").value, 10);
      var chName = $("fChName").value.trim();
      var id = $("fId").value.trim();
      var t = $("fT").value.trim();
      if (!ch || !id || !t) { alert("章号、编号、标题都要填"); return; }
      window.KGAPI.addItem({
        book: book, ch: ch, chTitle: chName, id: id,
        t: t, s: parseInt($("fS").value, 10), x: $("fX").value.trim()
      });
      closeForm();
      toast("已新增到 " + book + " 第 " + ch + " 章");
      updateStat();
    });
  }

  /* 章节节点 */
  window.EDIT_ADD_CHAPTER = function (bookId) {
    if (!window.KGAPI) return;
    var body =
      '<div class="field"><label>所属册</label><input value="' + esc(bookId) + '" readonly style="opacity:.6"></div>' +
      '<div class="field-row">' +
      '<div class="field"><label>章号</label><input id="fCh" type="number" placeholder="如 46"></div>' +
      '<div class="field"><label>章名</label><input id="fChName" placeholder="如 光合作用的演化"></div>' +
      "</div>" +
      '<p class="faint" style="margin:0">章号不要和已有章重复，否则不会生效。</p>';
    openForm("新增章节点", body, function () {
      var no = parseInt($("fCh").value, 10);
      var name = $("fChName").value.trim();
      if (!no || !name) { alert("章号和章名都要填"); return; }
      window.KGAPI.addChapter(bookId, no, name);
      closeForm();
      toast("已新增第 " + no + " 章");
      updateStat();
    });
  };

  window.EDIT_DEL_CHAPTER = function (bookId, no) {
    if (!window.KGAPI) return;
    var b = null;
    (window.KG_INDEX || []).forEach(function (x) { if (x.id === bookId) b = x; });
    var title = "";
    if (b) b.chapters.forEach(function (c) { if (c.n === no) title = c.t; });
    if (!confirm("删除第 " + no + " 章《" + title + "》？\n该章下的所有知识点也会一起隐藏。\n可以用「还原」恢复。")) return;
    window.KGAPI.removeChapter(bookId, no);
    toast("已删除第 " + no + " 章");
    updateStat();
  };

  /* 术语编辑 */
  function openTermForm(i) {
    if (!window.KGAPI || isNaN(i)) return;
    var base = (window.KG_TERMS || [])[i];
    if (!base) return;
    var o = window.KGAPI.layer().terms[i] || {};
    var cur = {
      t: o.t || base.t,
      e: o.e != null ? o.e : base.e,
      d: o.d != null ? o.d : base.d
    };
    var body =
      '<div class="field"><label>中文术语</label><input id="fT" value="' + esc(cur.t) + '"></div>' +
      '<div class="field"><label>英文 / 拉丁文</label><input id="fE" value="' + esc(cur.e) + '"></div>' +
      '<div class="field"><label>释义</label><textarea id="fX" style="min-height:140px">' + esc(cur.d) + "</textarea></div>";
    openForm("编辑术语", body, function () {
      window.KGAPI.editTerm(i, {
        t: $("fT").value.trim(),
        e: $("fE").value.trim(),
        d: $("fX").value.trim()
      });
      closeForm();
      toast("已保存");
      updateStat();
    });
  }

  /* 导入导出 */
  function doExport() {
    var data = { texts: readTexts() };
    if (window.KGAPI) data.kg = JSON.parse(window.KGAPI.exportJSON());
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "bio-lab-edits.json";
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
    toast("已导出");
  }

  function doImport(e) {
    var f = e.target.files && e.target.files[0];
    if (!f) return;
    var r = new FileReader();
    r.onload = function () {
      try {
        var o = JSON.parse(r.result);
        if (o.texts) lsSet(TKEY, JSON.stringify(o.texts));
        if (o.kg && window.KGAPI) window.KGAPI.importJSON(o.kg);
        toast("已导入，刷新后完全生效");
        setTimeout(function () { location.reload(); }, 900);
      } catch (err) {
        alert("文件格式不对");
      }
    };
    r.readAsText(f);
    e.target.value = "";
  }

  function doReset() {
    if (!confirm("还原所有修改？\n本机保存的知识点改动、术语改动、文案改动都会被清除。")) return;
    lsSet(TKEY, "{}");
    if (window.KGAPI) window.KGAPI.restoreAll();
    else location.reload();
  }

  /* 单文件版切换视图后重新挂载 */
  window.addEventListener("hashchange", function () {
    setTimeout(function () {
      applyTexts();
      if (editing) bindTextEdit(true);
    }, 60);
  });

  /* ---------- 初始化 ---------- */
  document.addEventListener("DOMContentLoaded", function () {
    buildUI();
    applyTexts();
    if (ssGet(SKEY) === "1") {
      unlocked = true;
      setEditing(true);
    }
  });
})();

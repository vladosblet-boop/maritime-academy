(function () {
  var KEY = "maritime.progress.v1";
  var BASE = document.documentElement.getAttribute("data-base") || "/";
  function P(path) { return BASE + path.replace(/^\//, ""); }

  function normalize(v) {
    v = v && typeof v === "object" ? v : {};
    return {
      completed: v.completed && typeof v.completed === "object" ? v.completed : {},
      bookmarks: v.bookmarks && typeof v.bookmarks === "object" ? v.bookmarks : {},
      recent: Array.isArray(v.recent) ? v.recent : [],
      dailyGoal: Number.isFinite(v.dailyGoal) ? v.dailyGoal : 1,
      tests: Array.isArray(v.tests) ? v.tests : [],
      checklists: v.checklists && typeof v.checklists === "object" ? v.checklists : {}
    };
  }

  function load() {
    try {
      return normalize(JSON.parse(localStorage.getItem(KEY)));
    } catch (e) {
      return normalize(null);
    }
  }

  function save(state) {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
      return true;
    } catch (e) {
      showMessage("Не удалось сохранить: браузер не разрешает localStorage.");
      return false;
    }
  }

  function today() {
    return new Date().toISOString().slice(0, 10);
  }

  function showMessage(text) {
    var box = document.querySelector("[data-message]");
    if (box) box.textContent = text;
  }

  var indexPromise = null;
  function loadIndex() {
    if (!indexPromise) {
      indexPromise = fetch(P("/search-index.json")).then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      });
    }
    return indexPromise;
  }

  function bySlug(list) {
    var map = {};
    list.forEach(function (a) { map[a.slug] = a; });
    return map;
  }

  function makeLink(article, extra) {
    var li = document.createElement("li");
    var a = document.createElement("a");
    a.href = article.url;
    a.textContent = article.title;
    li.appendChild(a);
    if (extra) {
      var note = document.createElement("span");
      note.className = "status";
      note.textContent = extra;
      li.appendChild(note);
    }
    return li;
  }

  function emptyItem(text) {
    var li = document.createElement("li");
    li.className = "empty";
    li.textContent = text;
    return li;
  }

  function setList(list, items) {
    list.innerHTML = "";
    if (!items.length) return;
    items.forEach(function (li) { list.appendChild(li); });
  }

  function refreshArticleButtons() {
    var slug = document.body.dataset.slug;
    if (!slug) return;
    var state = load();
    var done = !!state.completed[slug];
    var marked = !!state.bookmarks[slug];
    document.querySelectorAll('[data-action="complete"][data-slug="' + slug + '"]').forEach(function (b) {
      b.textContent = done ? "Пройдено" : "Отметить пройденной";
      b.setAttribute("aria-pressed", String(done));
    });
    document.querySelectorAll('[data-action="bookmark"][data-slug="' + slug + '"]').forEach(function (b) {
      b.textContent = marked ? "Убрать из закладок" : "В закладки";
      b.setAttribute("aria-pressed", String(marked));
    });
  }

  function recordVisit() {
    var slug = document.body.dataset.slug;
    if (!slug) return;
    var state = load();
    state.recent = [slug].concat(state.recent.filter(function (s) { return s !== slug; })).slice(0, 5);
    save(state);
  }

  function initHome() {
    var stats = document.querySelectorAll("[data-stat]");
    if (!stats.length) return;
    var state = load();
    var completedCount = Object.keys(state.completed).length;
    var todayCount = Object.keys(state.completed).filter(function (s) {
      return state.completed[s] === today();
    }).length;
    var set = function (name, value) {
      document.querySelectorAll('[data-stat="' + name + '"]').forEach(function (n) { n.textContent = value; });
    };
    set("completed", completedCount);
    set("bookmarks", Object.keys(state.bookmarks).length);
    set("today", todayCount);
    set("goal", state.dailyGoal);
    set("tests", state.tests.length);

    loadIndex().then(function (articles) {
      var map = bySlug(articles);
      var bar = document.querySelector("[data-stat-bar]");
      if (bar && articles.length) {
        bar.style.width = Math.round((completedCount / articles.length) * 100) + "%";
      }

      var recentList = document.querySelector("[data-recent]");
      if (recentList) {
        var items = state.recent.filter(function (s) { return map[s]; }).map(function (s) {
          return makeLink(map[s]);
        });
        setList(recentList, items.length ? items : [emptyItem("Здесь появятся статьи, которые вы открывали.")]);
      }

      return fetch(P("/routes.json")).then(function (r) { return r.ok ? r.json() : []; }).catch(function () { return []; }).then(function (routes) {
        routes = routes.slice().sort(function (a, b) { return a.level - b.level; });
        var routeOrder = [];
        routes.forEach(function (rt) {
          rt.articles.forEach(function (s) { if (map[s] && routeOrder.indexOf(s) === -1) routeOrder.push(s); });
        });
        var nextSlug = routeOrder.find(function (s) { return !state.completed[s]; });
        var nextArticle = nextSlug ? map[nextSlug] : articles.find(function (a) { return !state.completed[a.slug]; });

        var next = document.querySelector("[data-next-lesson]");
        if (next) {
          next.innerHTML = "";
          if (nextArticle) {
            next.appendChild(document.createTextNode("Следующий урок: "));
            var link = document.createElement("a");
            link.href = nextArticle.url;
            link.textContent = nextArticle.title;
            next.appendChild(link);
          } else {
            next.textContent = "Все статьи пройдены. Можно повторять темы и проходить тесты.";
          }
        }

        var levelBox = document.querySelector("[data-level]");
        if (levelBox) {
          var names = { 1: "Основы", 2: "Подготовка", 3: "Продвинутый" };
          var current = 3;
          for (var lv = 1; lv <= 2; lv++) {
            var inLevel = routes.filter(function (rt) { return rt.level === lv; });
            var all = [].concat.apply([], inLevel.map(function (rt) { return rt.articles; }));
            if (all.some(function (s) { return map[s] && !state.completed[s]; })) { current = lv; break; }
          }
          levelBox.textContent = "Текущий уровень: " + current + " «" + names[current] +
            "». Уровень растёт, когда пройдены статьи учебных маршрутов предыдущего уровня. Это учебная структура сайта, а не официальная квалификация.";
        }
      });
    }).catch(function () {
      var next = document.querySelector("[data-next-lesson]");
      if (next) next.textContent = "Не удалось загрузить список статей.";
    });
  }

  function initSearch() {
    var form = document.getElementById("search-form");
    if (!form) return;
    var input = document.getElementById("search-input");
    var status = document.getElementById("search-status");
    var results = document.getElementById("search-results");
    var articlesCache = null;

    function normalizeText(s) {
      return (s || "").toLowerCase().replace(/ё/g, "е");
    }

    function snippet(text, token) {
      var idx = normalizeText(text).indexOf(token);
      if (idx < 0) return text.slice(0, 160) + (text.length > 160 ? "…" : "");
      var start = Math.max(0, idx - 60);
      return (start > 0 ? "…" : "") + text.slice(start, start + 160) + "…";
    }

    function run(query) {
      var q = normalizeText(query).trim();
      results.innerHTML = "";
      if (!q) {
        status.textContent = "Введите слово из названия или текста статьи.";
        return;
      }
      var tokens = q.split(/\s+/);
      var found = articlesCache.filter(function (a) {
        var hay = normalizeText(a.title + " " + a.sectionTitle + " " + a.text);
        return tokens.every(function (t) { return hay.indexOf(t) !== -1; });
      });
      if (!found.length) {
        status.textContent = "Ничего не найдено по запросу «" + query + "».";
        return;
      }
      status.textContent = "Найдено статей: " + found.length + ".";
      found.forEach(function (a) {
        var li = document.createElement("li");
        var link = document.createElement("a");
        link.href = a.url;
        link.textContent = a.title;
        li.appendChild(link);
        var meta = document.createElement("span");
        meta.className = "status";
        meta.textContent = a.sectionTitle + " · " + a.status;
        li.appendChild(meta);
        var p = document.createElement("p");
        p.className = "muted";
        p.textContent = snippet(a.text, tokens[0]);
        li.appendChild(p);
        results.appendChild(li);
      });
    }

    status.textContent = "Загружаем материалы…";
    loadIndex().then(function (list) {
      articlesCache = list;
      var initial = new URLSearchParams(window.location.search).get("q") || "";
      input.value = initial;
      if (initial) run(initial);
      else status.textContent = "Введите слово из названия или текста статьи.";
    }).catch(function () {
      status.textContent = "Не удалось загрузить индекс поиска. Обновите страницу.";
    });

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!articlesCache) return;
      var value = input.value;
      history.replaceState(null, "", P("/search/?q=") + encodeURIComponent(value));
      run(value);
    });
  }

  function initProgressPage() {
    var completedList = document.querySelector('[data-list="completed"]');
    if (!completedList) return;
    var bookmarksList = document.querySelector('[data-list="bookmarks"]');

    function render() {
      var state = load();
      loadIndex().then(function (articles) {
        var map = bySlug(articles);
        var done = Object.keys(state.completed).filter(function (s) { return map[s]; });
        done.sort(function (a, b) { return state.completed[b].localeCompare(state.completed[a]); });
        setList(completedList, done.length
          ? done.map(function (s) { return makeLink(map[s], state.completed[s]); })
          : [emptyItem("Пока ничего не отмечено.")]);

        var marks = Object.keys(state.bookmarks).filter(function (s) { return map[s]; });
        setList(bookmarksList, marks.length
          ? marks.map(function (s) { return makeLink(map[s]); })
          : [emptyItem("Закладок пока нет.")]);
      }).catch(function () {
        setList(completedList, [emptyItem("Не удалось загрузить список статей.")]);
      });
    }

    render();
  }

  function initBackupButtons() {
    document.addEventListener("click", function (e) {
      var b = e.target.closest('[data-action="export"], [data-action="reset"]');
      if (!b) return;
      if (b.dataset.action === "export") {
        var blob = new Blob([JSON.stringify(load(), null, 2)], { type: "application/json" });
        var url = URL.createObjectURL(blob);
        var a = document.createElement("a");
        a.href = url;
        a.download = "maritime-academy-" + today() + ".json";
        a.click();
        URL.revokeObjectURL(url);
        showMessage("Файл с прогрессом сохранён в загрузки.");
      }
      if (b.dataset.action === "reset") {
        if (!window.confirm("Сбросить весь прогресс, закладки и историю? Это нельзя отменить.")) return;
        try { localStorage.removeItem(KEY); } catch (err) {}
        showMessage("Прогресс сброшен.");
        location.reload();
      }
    });
  }

  function initDocumentActions() {
    document.addEventListener("click", function (e) {
      var b = e.target.closest('[data-action="complete"], [data-action="bookmark"]');
      if (!b) return;
      var slug = b.dataset.slug;
      var state = load();
      if (b.dataset.action === "complete") {
        if (state.completed[slug]) delete state.completed[slug];
        else state.completed[slug] = today();
      } else {
        if (state.bookmarks[slug]) delete state.bookmarks[slug];
        else state.bookmarks[slug] = today();
      }
      save(state);
      refreshArticleButtons();
    });
  }

  function initGlossary() {
    var input = document.getElementById("glossary-search");
    var select = document.getElementById("glossary-category");
    if (!input || !select) return;
    var items = Array.prototype.slice.call(document.querySelectorAll("[data-term]"));
    var status = document.getElementById("glossary-status");

    var cats = [];
    items.forEach(function (li) {
      var c = li.dataset.category;
      if (cats.indexOf(c) === -1) cats.push(c);
    });
    cats.sort().forEach(function (c) {
      var o = document.createElement("option");
      o.value = c;
      o.textContent = c;
      select.appendChild(o);
    });

    function apply() {
      var q = input.value.toLowerCase().replace(/ё/g, "е").trim();
      var cat = select.value;
      var shown = 0;
      items.forEach(function (li) {
        var match = (!cat || li.dataset.category === cat) &&
          (!q || li.dataset.ru.replace(/ё/g, "е").indexOf(q) !== -1 || li.dataset.en.indexOf(q) !== -1);
        li.hidden = !match;
        if (match) shown++;
      });
      status.textContent = shown ? "Найдено терминов: " + shown + "." : "Ничего не найдено.";
    }

    input.addEventListener("input", apply);
    select.addEventListener("change", apply);
    apply();
  }

  function initCalculators() {
    var calcs = document.querySelectorAll("[data-calc]");
    if (!calcs.length) return;

    function num(node) {
      var v = parseFloat(node.value);
      return isNaN(v) || v < 0 ? null : v;
    }

    function out(card, selector, text) {
      var n = card.querySelector(selector);
      if (n) n.textContent = text;
    }

    function fmt(v) {
      return Number(v.toFixed(2)).toLocaleString("ru-RU");
    }

    var rules = {
      "knots-kmh": function (card) {
        var a = num(card.querySelector('[data-in="a"]'));
        var b = num(card.querySelector('[data-in="b"]'));
        out(card, "[data-out]", a === null ? "Введите неотрицательное число." : fmt(a * 1.852) + " км/ч");
        out(card, "[data-out2]", b === null ? "Введите неотрицательное число." : fmt(b / 1.852) + " узлов");
      },
      "miles": function (card) {
        var a = num(card.querySelector('[data-in="a"]'));
        var b = num(card.querySelector('[data-in="b"]'));
        out(card, "[data-out]", a === null ? "Введите неотрицательное число." : fmt(a * 1.852) + " км");
        out(card, "[data-out2]", b === null ? "Введите неотрицательное число." : fmt(b / 1.852) + " морских миль");
      },
      "eta": function (card) {
        var dist = num(card.querySelector('[data-in="dist"]'));
        var speed = num(card.querySelector('[data-in="speed"]'));
        var now = card.querySelector('[data-in="now"]').value;
        if (dist === null || speed === null || speed === 0) {
          out(card, "[data-out]", "Введите расстояние и скорость больше нуля.");
          return;
        }
        var hours = dist / speed;
        var h = Math.floor(hours);
        var m = Math.round((hours - h) * 60);
        var text = "Время перехода: " + h + " ч " + m + " мин.";
        if (now) {
          var parts = now.split(":").map(Number);
          var total = parts[0] * 60 + parts[1] + Math.round(hours * 60);
          var hh = Math.floor(total / 60) % 24;
          var mm = total % 60;
          text += " Прибытие: " + String(hh).padStart(2, "0") + ":" + String(mm).padStart(2, "0") + ".";
        }
        out(card, "[data-out]", text);
      },
      "coords": function (card) {
        var deg = num(card.querySelector('[data-in="deg"]'));
        var min = num(card.querySelector('[data-in="min"]'));
        var dec = num(card.querySelector('[data-in="dec"]'));
        out(card, "[data-out]", deg === null || min === null || min >= 60
          ? "Градусы — целое неотрицательное число, минуты — от 0 до 60."
          : "Десятичные градусы: " + (deg + min / 60).toFixed(4));
        if (dec === null) {
          out(card, "[data-out2]", "Введите неотрицательное число.");
        } else {
          var d = Math.floor(dec);
          var mins = (dec - d) * 60;
          out(card, "[data-out2]", d + "° " + mins.toFixed(2).replace(".", ",") + "′");
        }
      },
      "fuel": function (card) {
        var rate = num(card.querySelector('[data-in="rate"]'));
        var hours = num(card.querySelector('[data-in="hours"]'));
        out(card, "[data-out]", rate === null || hours === null
          ? "Введите неотрицательные числа."
          : "Расход за время: " + fmt((rate / 24) * hours) + " т (учебный расчёт)");
      }
    };

    calcs.forEach(function (card) {
      var key = card.dataset.calc;
      var run = function () { rules[key](card); };
      card.querySelectorAll("input").forEach(function (i) { i.addEventListener("input", run); });
      run();
    });
  }

  function initTests() {
    var select = document.getElementById("quiz-select");
    if (!select) return;
    var area = document.getElementById("quiz-area");
    var historyList = document.querySelector("[data-tests-history]");
    var quizzes = [];

    function renderHistory() {
      var history = load().tests.slice().reverse().slice(0, 10);
      setList(historyList, history.length
        ? history.map(function (t) {
            var li = document.createElement("li");
            li.textContent = t.date + " · " + t.title + " · " + t.score + " из " + t.total + " (" + Math.round((t.score / t.total) * 100) + "%)";
            return li;
          })
        : [emptyItem("Попыток пока нет.")]);
    }

    function renderQuiz(quiz, questions) {
      area.innerHTML = "";
      var form = document.createElement("form");
      questions.forEach(function (item, qi) {
        var fs = document.createElement("fieldset");
        fs.className = "question";
        var legend = document.createElement("legend");
        legend.textContent = (qi + 1) + ". " + item.q;
        fs.appendChild(legend);
        item.options.forEach(function (opt, oi) {
          var label = document.createElement("label");
          label.className = "option";
          var input = document.createElement("input");
          input.type = "radio";
          input.name = "q" + qi;
          input.value = String(oi);
          label.appendChild(input);
          label.appendChild(document.createTextNode(" " + opt));
          fs.appendChild(label);
        });
        var feedback = document.createElement("p");
        feedback.className = "feedback";
        feedback.dataset.q = String(qi);
        fs.appendChild(feedback);
        form.appendChild(fs);
      });
      var submit = document.createElement("button");
      submit.type = "submit";
      submit.className = "btn";
      submit.textContent = "Проверить";
      form.appendChild(submit);
      area.appendChild(form);

      form.addEventListener("submit", function (e) {
        e.preventDefault();
        var score = 0;
        var wrong = [];
        questions.forEach(function (item, qi) {
          var chosen = form.querySelector('input[name="q' + qi + '"]:checked');
          var fb = form.querySelector('[data-q="' + qi + '"]');
          var ok = chosen && Number(chosen.value) === item.answer;
          if (ok) score++;
          else wrong.push(item);
          fb.textContent = !chosen ? "Ответ не выбран. " + item.explain
            : ok ? "Верно. " + item.explain
            : "Неверно. " + item.explain;
          fb.className = "feedback " + (ok ? "ok" : "bad");
        });
        var state = load();
        state.tests.push({
          date: today(),
          title: quiz.title,
          score: score,
          total: questions.length
        });
        save(state);
        var summary = document.createElement("p");
        summary.className = "result";
        summary.textContent = "Результат: " + score + " из " + questions.length + " (" +
          Math.round((score / questions.length) * 100) + "%).";
        area.insertBefore(summary, form);
        if (wrong.length) {
          var retry = document.createElement("button");
          retry.type = "button";
          retry.className = "btn btn-ghost";
          retry.textContent = "Повторить неверные (" + wrong.length + ")";
          retry.addEventListener("click", function () { renderQuiz(quiz, wrong); });
          area.appendChild(retry);
        }
        renderHistory();
      });
    }

    fetch(P("/quizzes.json")).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    }).then(function (list) {
      quizzes = list;
      list.forEach(function (q, i) {
        var o = document.createElement("option");
        o.value = String(i);
        o.textContent = q.title;
        select.appendChild(o);
      });
      select.addEventListener("change", function () {
        var quiz = quizzes[Number(select.value)];
        renderQuiz(quiz, quiz.questions);
      });
      renderQuiz(list[0], list[0].questions);
    }).catch(function () {
      area.textContent = "Не удалось загрузить вопросы.";
    });

    renderHistory();
  }

  function initPager() {
    var pager = document.querySelector("[data-pager]");
    var slug = document.body.dataset.slug;
    if (!pager || !slug) return;
    loadIndex().then(function (articles) {
      var i = articles.findIndex(function (a) { return a.slug === slug; });
      if (i === -1) return;
      var prev = articles[i - 1];
      var next = articles[i + 1];
      if (prev) {
        var p = document.createElement("a");
        p.href = prev.url;
        p.textContent = "← " + prev.title;
        pager.appendChild(p);
      }
      if (next) {
        var n = document.createElement("a");
        n.href = next.url;
        n.textContent = next.title + " →";
        n.className = "pager-next";
        pager.appendChild(n);
      }
    }).catch(function () {});
  }

  function initImport() {
    var input = document.querySelector("[data-import]");
    if (!input) return;
    input.addEventListener("change", function () {
      var file = input.files && input.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        var parsed;
        try {
          parsed = JSON.parse(reader.result);
        } catch (e) {
          showMessage("Файл не похож на резервную копию: неверный JSON.");
          return;
        }
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          showMessage("Файл не похож на резервную копию.");
          return;
        }
        if (save(normalize(parsed))) {
          showMessage("Прогресс восстановлен из файла. Обновите страницу, чтобы увидеть данные на главной.");
          location.reload();
        }
      };
      reader.readAsText(file);
    });
  }

  function initBuoyancy() {
    var card = document.querySelector('[data-trainer="buoyancy"]');
    if (!card) return;
    var body = card.querySelector('[data-in="body"]');
    var water = card.querySelector('[data-in="water"]');
    var rect = card.querySelector("[data-body]");
    var result = card.querySelector("[data-buoy-result]");
    var size = 80;
    var waterline = 100;

    function update() {
      var rb = Number(body.value);
      var rw = Number(water.value);
      card.querySelector('[data-val="body"]').textContent = rb;
      card.querySelector('[data-val="water"]').textContent = rw;
      if (rb >= rw) {
        rect.setAttribute("y", String(waterline + 20));
        result.textContent = "Плотность тела не меньше плотности воды: тело тонет.";
        return;
      }
      var f = rb / rw;
      rect.setAttribute("y", String(waterline - (1 - f) * size));
      result.textContent = "Под водой примерно " + Math.round(f * 100) + "% объёма. Тело плавает.";
    }

    body.addEventListener("input", update);
    water.addEventListener("input", update);
    update();
  }

  function initRoutes() {
    var box = document.querySelector("[data-routes]");
    if (!box) return;
    fetch(P("/routes.json")).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    }).then(function (routes) {
      return loadIndex().then(function (articles) {
        var map = bySlug(articles);
        var state = load();
        box.innerHTML = "";
        routes.forEach(function (route) {
          var card = document.createElement("section");
          card.className = "panel";
          var h = document.createElement("h2");
          h.textContent = route.title + " (уровень " + route.level + ")";
          card.appendChild(h);
          var p = document.createElement("p");
          p.className = "muted";
          p.textContent = route.description;
          card.appendChild(p);
          var done = route.articles.filter(function (s) { return state.completed[s]; }).length;
          var pct = Math.round((done / route.articles.length) * 100);
          var status = document.createElement("p");
          status.textContent = "Пройдено " + done + " из " + route.articles.length + " (" + pct + "%)";
          card.appendChild(status);
          var bar = document.createElement("div");
          bar.className = "progress-bar";
          var fill = document.createElement("div");
          fill.className = "progress-fill";
          fill.style.width = pct + "%";
          bar.appendChild(fill);
          card.appendChild(bar);
          var list = document.createElement("ol");
          list.className = "article-list";
          route.articles.forEach(function (slug) {
            var a = map[slug];
            if (!a) return;
            var li = makeLink(a, state.completed[slug] ? "пройдено" : null);
            list.appendChild(li);
          });
          card.appendChild(list);
          box.appendChild(card);
        });
      });
    }).catch(function () {
      box.textContent = "Не удалось загрузить маршруты.";
    });
  }

  function initSchema() {
    var info = document.querySelector("[data-ship-info]");
    if (!info) return;
    var texts = {
      bow: "Нос — передняя оконечность. Здесь обычно стоят якорные устройства и швартовные механизмы.",
      stern: "Корма — задняя оконечность. Здесь обычно находятся руль и гребной винт.",
      hold: "Грузовой трюм — помещение для груза. Груз распределяют так, чтобы не нарушить осадку и остойчивость.",
      bridge: "Мостик — рабочее место вахтенных. Отсюда управляют судном и ведут наблюдение.",
      engine: "Машинное отделение — находятся главный двигатель и вспомогательные механизмы.",
      rudder: "Руль — управляет направлением движения, работает в потоке воды за винтом.",
      ballast: "Балластный танк — заполняется водой для изменения осадки и дифферента. В сечении видно двойное дно: танки между внутренним и наружным днищем, они же защищают трюм при касании грунта.",
      keel: "Киль — основная продольная балка в днище, «хребет» корпуса.",
      deck: "Главная палуба — верхнее сплошное перекрытие корпуса. Она участвует в продольной прочности судна.",
      hatch: "Крышка люка закрывает грузовой трюм сверху и должна быть водонепроницаемой в море.",
      wingtank: "Бортовые танки расположены вдоль бортов. В них может быть балласт или топливо, они добавляют защиту трюма при повреждении борта."
    };
    document.querySelectorAll("[data-view]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var view = btn.dataset.view;
        document.querySelectorAll("[data-view]").forEach(function (b) {
          b.setAttribute("aria-pressed", String(b === btn));
        });
        document.querySelectorAll("[data-view-svg]").forEach(function (svg) {
          svg.toggleAttribute("hidden", svg.getAttribute("data-view-svg") !== view);
        });
        info.textContent = "Выберите часть судна.";
      });
    });

    document.querySelectorAll(".part").forEach(function (g) {
      var show = function () {
        document.querySelectorAll(".part").forEach(function (x) { x.classList.remove("active"); });
        g.classList.add("active");
        info.textContent = texts[g.dataset.part] || "";
      };
      g.addEventListener("click", show);
      g.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); show(); }
      });
    });
  }

  function initColreg() {
    var area = document.querySelector("[data-colreg-area]");
    if (!area) return;
    var scenarios = [
      {
        text: "Другое судно пересекает наш курс, и мы видим его справа по носу. Что делать?",
        options: ["Сохранить курс и скорость", "Заметно отвернуть вправо", "Отвернуть влево и сбросить скорость"],
        answer: 1,
        explain: "Судно, видящее другое с правого борта, обязано уступить. Поворот вправо заметен и безопасен."
      },
      {
        text: "Два судна идут навстречу, оба видят огни друг друга по носу. Что делают оба судна?",
        options: ["Оба отворачивают влево", "Оба отворачивают вправо заблаговременно", "Одно из них останавливается, другое сохраняет курс"],
        answer: 1,
        explain: "При встречном курсе каждое судно отворачивает вправо, оставляя другое по левому борту."
      },
      {
        text: "Наше судно обгоняет другое, которое идёт медленнее. Как вести себя?",
        options: ["Идти вплотную сбоку, чтобы быстрее обогнать", "Держаться в стороне и не сближаться, пока полностью не пройдём", "Остановиться и ждать"],
        answer: 1,
        explain: "Обгоняющее судно держится в стороне до полного прохода и отвечает за безопасность маневра."
      },
      {
        text: "В тумане радар показывает цель, пеленг на которую не меняется. Что делать?",
        options: ["Считать, что опасности нет", "Снизить скорость, следить за пеленгом и быть готовым остановиться", "Ускориться, чтобы уйти от цели"],
        answer: 1,
        explain: "Неизменный пеленг означает риск столкновения. Нужно снизить скорость и готовиться к действиям."
      }
    ];
    var index = 0;

    function render() {
      var s = scenarios[index];
      area.innerHTML = "";
      var p = document.createElement("p");
      p.textContent = (index + 1) + " из " + scenarios.length + ". " + s.text;
      area.appendChild(p);
      var list = document.createElement("div");
      s.options.forEach(function (opt, i) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = "btn btn-ghost option-btn";
        b.textContent = opt;
        b.addEventListener("click", function () {
          var fb = area.querySelector(".feedback");
          var ok = i === s.answer;
          fb.textContent = (ok ? "Верно. " : "Неверно. ") + s.explain;
          fb.className = "feedback " + (ok ? "ok" : "bad");
        });
        list.appendChild(b);
      });
      area.appendChild(list);
      var fb = document.createElement("p");
      fb.className = "feedback";
      area.appendChild(fb);
      var next = document.createElement("button");
      next.type = "button";
      next.className = "btn";
      next.textContent = index < scenarios.length - 1 ? "Следующая ситуация" : "Начать сначала";
      next.addEventListener("click", function () {
        index = index < scenarios.length - 1 ? index + 1 : 0;
        render();
      });
      area.appendChild(next);
    }
    render();
  }

  function initCoords() {
    var task = document.querySelector("[data-coords-task]");
    if (!task) return;
    var degInput = document.querySelector("[data-coords-deg]");
    var minInput = document.querySelector("[data-coords-min]");
    var feedback = document.querySelector("[data-coords-feedback]");
    var current = 0;

    function next() {
      current = Math.round((Math.random() * 179.99) * 100) / 100;
      task.textContent = "Переведите " + current.toFixed(2).replace(".", ",") + "° в градусы и минуты.";
      degInput.value = "";
      minInput.value = "";
      feedback.textContent = "";
      feedback.className = "feedback";
    }

    document.querySelector("[data-coords-next]").addEventListener("click", next);
    document.querySelector("[data-coords-check]").addEventListener("click", function () {
      var expDeg = Math.floor(current);
      var expMin = Math.round((current - expDeg) * 60 * 10) / 10;
      var d = Number(degInput.value);
      var m = Number(minInput.value.replace(",", "."));
      var ok = degInput.value !== "" && minInput.value !== "" && d === expDeg && Math.abs(m - expMin) <= 0.1;
      feedback.textContent = ok
        ? "Верно: " + expDeg + "° " + expMin.toFixed(1).replace(".", ",") + "′."
        : "Неверно. Ответ: " + expDeg + "° " + expMin.toFixed(1).replace(".", ",") + "′. Минуты = дробная часть × 60.";
      feedback.className = "feedback " + (ok ? "ok" : "bad");
    });
    next();
  }

  function initChart() {
    var svg = document.querySelector("[data-chart]");
    if (!svg) return;
    var grid = svg.querySelector("[data-grid]");
    var route = svg.querySelector("[data-route]");
    var pointsG = svg.querySelector("[data-points]");
    var info = document.querySelector("[data-chart-info]");
    var LAT0 = 59, LAT1 = 60, LON0 = 30, LON1 = 31, SIZE = 400;
    var pts = [];
    var NS = "http://www.w3.org/2000/svg";

    for (var k = 1; k < 10; k++) {
      var x = (SIZE / 10) * k;
      var ln = document.createElementNS(NS, "line");
      ln.setAttribute("x1", x); ln.setAttribute("y1", 0); ln.setAttribute("x2", x); ln.setAttribute("y2", SIZE);
      grid.appendChild(ln);
      var y = (SIZE / 10) * k;
      var lh = document.createElementNS(NS, "line");
      lh.setAttribute("x1", 0); lh.setAttribute("y1", y); lh.setAttribute("x2", SIZE); lh.setAttribute("y2", y);
      grid.appendChild(lh);
    }

    function toLatLon(px, py) {
      return {
        lat: LAT1 - (py / SIZE) * (LAT1 - LAT0),
        lon: LON0 + (px / SIZE) * (LON1 - LON0)
      };
    }

    function nm(a, b) {
      var midLat = ((a.lat + b.lat) / 2) * Math.PI / 180;
      var dy = (b.lat - a.lat) * 60;
      var dx = (b.lon - a.lon) * 60 * Math.cos(midLat);
      return Math.sqrt(dx * dx + dy * dy);
    }

    function draw() {
      pointsG.innerHTML = "";
      route.setAttribute("points", pts.map(function (p) { return p.x + "," + p.y; }).join(" "));
      pts.forEach(function (p, i) {
        var c = document.createElementNS(NS, "circle");
        c.setAttribute("cx", p.x); c.setAttribute("cy", p.y); c.setAttribute("r", 5);
        c.style.fill = "var(--warn)";
        pointsG.appendChild(c);
      });
      if (pts.length < 2) {
        info.textContent = pts.length ? "Поставьте следующую точку." : "Поставьте первую точку.";
        return;
      }
      var total = 0;
      for (var i = 1; i < pts.length; i++) total += nm(pts[i - 1].geo, pts[i].geo);
      info.textContent = "Точек: " + pts.length + ". Длина маршрута ≈ " + total.toFixed(1).replace(".", ",") + " морских мили.";
    }

    svg.addEventListener("click", function (e) {
      var rect = svg.getBoundingClientRect();
      var px = ((e.clientX - rect.left) / rect.width) * SIZE;
      var py = ((e.clientY - rect.top) / rect.height) * SIZE;
      pts.push({ x: px, y: py, geo: toLatLon(px, py) });
      draw();
    });

    document.querySelector("[data-chart-reset]").addEventListener("click", function () {
      pts = [];
      draw();
    });
  }

  function initSituations() {
    var area = document.querySelector("[data-situation-area]");
    if (!area) return;
    var tasks = [
      {
        title: "Туман и приближение судна",
        steps: [
          {
            text: "Видимость 300 м, радар показывает цель на 6 милях с неизменным пеленгом. Ваши действия?",
            options: ["Продолжить курс, цель далеко", "Снизить скорость до безопасной, включить сигнал тумана, следить за целью", "Резко изменить курс"],
            answer: 1,
            explain: "В тумане снижают скорость и следят за пеленгом. Неизменный пеленг означает риск столкновения."
          },
          {
            text: "Цель сблизилась до 2 миль, пеленг по-прежнему не меняется. Что делать?",
            options: ["Ждать, пока цель изменит курс", "Заблаговременно и заметно изменить курс вправо, при необходимости остановиться", "Ускориться, чтобы проскочить"],
            answer: 1,
            explain: "Маневр должен быть заблаговременным и заметным. Ускорение и ожидание опасны."
          }
        ]
      },
      {
        title: "Отклонение от курса на переходе",
        steps: [
          {
            text: "Вы заметили, что судно за час сместилось на 1 милю от линии пути. Что сделаете первым?",
            options: ["Продолжить, отклонение небольшое", "Проверить место по ориентиру или GNSS", "Сразу изменить курс на 90°"],
            answer: 1,
            explain: "Сначала определяют место по независимому источнику, потом решают, как корректировать курс."
          },
          {
            text: "Место подтверждено. Течение 2 узла с востока. Какую поправку внести?",
            options: ["Курс вправо, против сноса на восток", "Курс влево, против сноса на восток", "Поправку не вносить"],
            answer: 1,
            explain: "Течение с востока сносит судно на восток, поэтому курс смещают к западу, то есть влево от направления на север."
          }
        ]
      },
      {
        title: "Пожар в машинном отделении",
        steps: [
          {
            text: "Обнаружен дым из машинного отделения. Первое действие?",
            options: ["Открыть дверь и посмотреть", "Поднять тревогу по плану и сообщить капитану", "Выключить вентиляцию и никому не говорить"],
            answer: 1,
            explain: "Первое — тревога и сообщение капитану. Открытие двери без защиты может усилить горение."
          },
          {
            text: "Пожар подтверждён, электрооборудование задействовано. Что делать до тушения?",
            options: ["Тушить водой без отключения питания", "Отключить питание, затем тушить подходящим средством", "Ждать, пока огонь погаснет сам"],
            answer: 1,
            explain: "Сначала отключают питание. Вода и электричество опасны вместе."
          }
        ]
      }
    ];

    var t = 0;
    var s = 0;
    var score = 0;

    function render() {
      area.innerHTML = "";
      var task = tasks[t];
      var step = task.steps[s];
      var head = document.createElement("p");
      head.className = "muted";
      head.textContent = "Задача " + (t + 1) + " из " + tasks.length + ": " + task.title + ". Шаг " + (s + 1) + " из " + task.steps.length + ".";
      area.appendChild(head);
      var p = document.createElement("p");
      p.textContent = step.text;
      area.appendChild(p);
      var fb = document.createElement("p");
      fb.className = "feedback";
      step.options.forEach(function (opt, i) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = "btn btn-ghost option-btn";
        b.textContent = opt;
        b.addEventListener("click", function () {
          var ok = i === step.answer;
          if (ok) score++;
          fb.textContent = (ok ? "Верно. " : "Неверно. ") + step.explain;
          fb.className = "feedback " + (ok ? "ok" : "bad");
          area.querySelectorAll(".option-btn").forEach(function (x) { x.disabled = true; });
          var nextBtn = area.querySelector(".next-step");
          if (nextBtn) nextBtn.hidden = false;
        });
        area.appendChild(b);
      });
      area.appendChild(fb);
      var next = document.createElement("button");
      next.type = "button";
      next.className = "btn next-step";
      next.hidden = true;
      var last = s === task.steps.length - 1 && t === tasks.length - 1;
      next.textContent = last ? "Итог" : "Дальше";
      next.addEventListener("click", function () {
        if (last) {
          area.innerHTML = "";
          var res = document.createElement("p");
          res.className = "result";
          var total = tasks.reduce(function (acc, x) { return acc + x.steps.length; }, 0);
          res.textContent = "Итог: " + score + " из " + total + " верных действий.";
          area.appendChild(res);
          var again = document.createElement("button");
          again.type = "button";
          again.className = "btn btn-ghost";
          again.textContent = "Пройти заново";
          again.addEventListener("click", function () { t = 0; s = 0; score = 0; render(); });
          area.appendChild(again);
          return;
        }
        if (s < task.steps.length - 1) s++;
        else { t++; s = 0; }
        render();
      });
      area.appendChild(next);
    }
    render();
  }

  function initBridge() {
    var card = document.querySelector("[data-bridge-card]");
    if (!card) return;
    var items = {
      radar: ["Радар и ARPA", "Показывает суда, берег и буи по отражённым радиоимпульсам, в том числе в тумане и ночью. ARPA сопровождает цели и считает CPA и TCPA.", "Помехи от волн и дождя, мёртвые зоны, слабое отражение малых судов.", "instruments-radar-ais"],
      ecdis: ["ECDIS", "Электронная карта с положением судна, маршрутом и предупреждениями об опасностях и отклонении.", "Зависит от питания, GNSS и актуальности карт. Нужен резерв.", "instruments-ecdis"],
      autopilot: ["Руль и авторулевой", "Штурвал или авторулевой держат курс. Авторулевой сравнивает текущий курс с заданным и перекладывает руль.", "Авторулевой не видит опасностей. В узостях и при сложной обстановке переходят на ручное управление.", "instruments-avtopilot"],
      gyro: ["Репитер гирокомпаса", "Показывает истинный курс от гирокомпаса. Рядом обычно есть магнитный компас как резерв.", "Гирокомпас требует питания. Его показания сверяют с магнитным компасом.", "instruments-kompas"],
      telegraph: ["Машинный телеграф", "Передаёт в машинное отделение команды хода: вперёд, назад, малый, средний, полный.", "Двигатель меняет режим не мгновенно, а судно реагирует ещё медленнее.", "vessel-mashinnoe-otdelenie"],
      echo: ["Эхолот и лаг", "Эхолот показывает глубину под датчиком, лаг — скорость и пройденное расстояние.", "Глубина отсчитывается от датчика, а не от киля. Лаг относительно воды не учитывает течение.", "instruments-eholot-lag"],
      vhf: ["УКВ-радиостанция", "Связь с соседними судами, портом и лоцманом. Канал 16 — вызов и бедствие.", "Дальность ограничена. Договорённость по радио не отменяет правил МППСС.", "svyaz-vhf"],
      gmdss: ["Пульт GMDSS", "Передача сигнала бедствия цифровым вызовом и спутниковой связью, приём сообщений безопасности.", "Состав оборудования зависит от района плавания. Нужно знать порядок действий заранее.", "instruments-gmdss-navtex"],
      navtex: ["NAVTEX", "Принимает навигационные и метеорологические предупреждения на частоте 518 кГц.", "Принимает только настроенные станции и категории сообщений.", "instruments-gmdss-navtex"],
      ais: ["AIS", "Показывает название, позицию, курс и скорость судов, передающих AIS, даже за горизонтом.", "AIS есть не у всех судов, данные могут быть ошибочными. Решения принимают по радару и визуально.", "instruments-radar-ais"]
    };
    var parts = document.querySelectorAll("[data-bridge]");
    parts.forEach(function (g) {
      var show = function () {
        var d = items[g.dataset.bridge];
        if (!d) return;
        parts.forEach(function (x) { x.classList.remove("active"); });
        g.classList.add("active");
        card.innerHTML = "";
        var h = document.createElement("h2");
        h.textContent = d[0];
        var p = document.createElement("p");
        p.textContent = d[1];
        var lim = document.createElement("p");
        lim.className = "muted";
        lim.textContent = "Ограничения: " + d[2];
        var a = document.createElement("a");
        a.href = P("/articles/" + d[3] + "/");
        a.textContent = "Подробнее в статье →";
        card.appendChild(h);
        card.appendChild(p);
        card.appendChild(lim);
        card.appendChild(a);
      };
      g.addEventListener("click", show);
      g.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); show(); }
      });
    });
  }

  function initChecklists() {
    var slug = document.body.dataset.slug;
    var article = document.querySelector(".article");
    if (!slug || !article) return;
    var items = Array.prototype.filter.call(article.querySelectorAll("li"), function (li) {
      return /^\[ \]\s/.test(li.textContent);
    });
    if (!items.length) return;
    var state = load();
    var saved = state.checklists[slug] || {};
    items.forEach(function (li, i) {
      var text = li.textContent.replace(/^\[ \]\s*/, "");
      li.textContent = "";
      li.classList.add("check-item");
      var label = document.createElement("label");
      var box = document.createElement("input");
      box.type = "checkbox";
      box.checked = !!saved[i];
      label.appendChild(box);
      label.appendChild(document.createTextNode(" " + text));
      li.appendChild(label);
      box.addEventListener("change", function () {
        var s = load();
        s.checklists[slug] = s.checklists[slug] || {};
        if (box.checked) s.checklists[slug][i] = today();
        else delete s.checklists[slug][i];
        save(s);
        updateCount();
      });
    });
    var counter = document.createElement("p");
    counter.className = "result";
    items[0].parentNode.parentNode.insertBefore(counter, items[0].parentNode);
    function updateCount() {
      var done = items.filter(function (li) { return li.querySelector("input").checked; }).length;
      counter.textContent = "Выполнено " + done + " из " + items.length + ". Отметки сохраняются в этом браузере.";
    }
    updateCount();
  }

  function initDataPage() {
    var box = document.querySelector("[data-mydata]");
    if (!box) return;
    var goalInput = document.querySelector("[data-goal-input]");
    var raw = document.querySelector("[data-raw]");

    function render() {
      var s = load();
      var checks = Object.keys(s.checklists).reduce(function (n, k) { return n + Object.keys(s.checklists[k]).length; }, 0);
      var rows = [
        ["Пройдено уроков", Object.keys(s.completed).length],
        ["Закладок", Object.keys(s.bookmarks).length],
        ["Попыток тестов", s.tests.length],
        ["Недавно открытых статей", s.recent.length],
        ["Отметок в чек-листах", checks],
        ["Дневная цель, уроков", s.dailyGoal]
      ];
      box.innerHTML = "";
      rows.forEach(function (r) {
        var tr = document.createElement("tr");
        var a = document.createElement("td");
        a.textContent = r[0];
        var b = document.createElement("td");
        b.textContent = r[1];
        tr.appendChild(a);
        tr.appendChild(b);
        box.appendChild(tr);
      });
      goalInput.value = s.dailyGoal;
      raw.textContent = JSON.stringify(s, null, 2);
    }

    document.querySelector("[data-goal-save]").addEventListener("click", function () {
      var v = parseInt(goalInput.value, 10);
      if (isNaN(v) || v < 1 || v > 20) {
        showMessage("Дневная цель — целое число от 1 до 20.");
        return;
      }
      var s = load();
      s.dailyGoal = v;
      if (save(s)) showMessage("Дневная цель сохранена: " + v + ".");
      render();
    });
    render();
  }

  function initHomeExtras() {
    var marks = document.querySelector("[data-home-bookmarks]");
    var tests = document.querySelector("[data-home-tests]");
    if (!marks && !tests) return;
    var s = load();
    if (tests) {
      var last = s.tests.slice(-3).reverse();
      setList(tests, last.length
        ? last.map(function (t) {
            var li = document.createElement("li");
            li.textContent = t.date + " · " + t.title + " · " + t.score + " из " + t.total + " (" + Math.round((t.score / t.total) * 100) + "%)";
            return li;
          })
        : [emptyItem("Тесты ещё не проходились.")]);
    }
    if (marks) {
      loadIndex().then(function (articles) {
        var map = bySlug(articles);
        var list = Object.keys(s.bookmarks).filter(function (k) { return map[k]; }).slice(0, 5);
        setList(marks, list.length
          ? list.map(function (k) { return makeLink(map[k]); })
          : [emptyItem("Добавляйте статьи в закладки кнопкой на странице статьи.")]);
      }).catch(function () {});
    }
  }

  function initMotion() {
    var svg = document.querySelector("[data-motion-svg]");
    if (!svg) return;
    var NS = "http://www.w3.org/2000/svg";
    var C = 200, PX = 20;
    var grid = svg.querySelector("[data-motion-grid]");
    for (var k = 0; k <= 400; k += 40) {
      ["v", "h"].forEach(function (d) {
        var l = document.createElementNS(NS, "line");
        if (d === "v") { l.setAttribute("x1", k); l.setAttribute("x2", k); l.setAttribute("y1", 0); l.setAttribute("y2", 400); }
        else { l.setAttribute("y1", k); l.setAttribute("y2", k); l.setAttribute("x1", 0); l.setAttribute("x2", 400); }
        grid.appendChild(l);
      });
    }
    var ship = svg.querySelector("[data-motion-ship]");
    var track = svg.querySelector("[data-motion-track]");
    var water = svg.querySelector("[data-motion-water]");
    var result = document.querySelector("[data-motion-result]");
    var timer = null;

    function val(name) { return parseFloat(document.querySelector('[data-motion="' + name + '"]').value); }
    function rad(d) { return d * Math.PI / 180; }
    function setLine(line, x, y) { line.setAttribute("x2", x); line.setAttribute("y2", y); }

    document.querySelector("[data-motion-run]").addEventListener("click", function () {
      var course = val("course"), speed = val("speed"), time = val("time"), set = val("set"), drift = val("drift");
      if ([course, speed, time, set, drift].some(isNaN) || speed < 0 || time <= 0 || drift < 0) {
        result.textContent = "Проверьте ввод: числа должны быть неотрицательными, время больше нуля.";
        return;
      }
      var h = time / 60;
      var wN = speed * h * Math.cos(rad(course)), wE = speed * h * Math.sin(rad(course));
      var gN = wN + drift * h * Math.cos(rad(set)), gE = wE + drift * h * Math.sin(rad(set));
      var dist = Math.sqrt(gN * gN + gE * gE);
      var cog = (Math.atan2(gE, gN) * 180 / Math.PI + 360) % 360;
      var fits = Math.max(Math.abs(gN), Math.abs(gE), Math.abs(wN), Math.abs(wE)) * PX <= 195;
      var scale = fits ? PX : 195 / Math.max(Math.abs(gN), Math.abs(gE), Math.abs(wN), Math.abs(wE));
      setLine(water, C + wE * scale, C - wN * scale);
      if (timer) clearTimeout(timer);
      var start = Date.now();
      function step() {
        var p = Math.min((Date.now() - start) / 1500, 1);
        var x = C + gE * scale * p, y = C - gN * scale * p;
        ship.setAttribute("cx", x);
        ship.setAttribute("cy", y);
        setLine(track, x, y);
        if (p < 1) timer = setTimeout(step, 16);
      }
      step();
      result.textContent = "Пройдено над грунтом " + dist.toFixed(1).replace(".", ",") + " мили, путевой угол " +
        String(Math.round(cog) % 360).padStart(3, "0") + "°. Смещение: " +
        (gN >= 0 ? "на север " : "на юг ") + Math.abs(gN).toFixed(1).replace(".", ",") + ", " +
        (gE >= 0 ? "на восток " : "на запад ") + Math.abs(gE).toFixed(1).replace(".", ",") + " мили." +
        (fits ? "" : " Масштаб уменьшен, чтобы путь поместился на карте.");
    });
  }

  function initFlashcards() {
    var area = document.querySelector("[data-fc-area]");
    if (!area) return;
    var terms = [];
    var mode = "cards";
    var i = 0, known = 0, seen = 0;

    function shuffle(a) {
      for (var j = a.length - 1; j > 0; j--) {
        var r = Math.floor(Math.random() * (j + 1));
        var t = a[j]; a[j] = a[r]; a[r] = t;
      }
      return a;
    }

    function cards() {
      area.innerHTML = "";
      var t = terms[i % terms.length];
      var card = document.createElement("button");
      card.type = "button";
      card.className = "flashcard";
      card.textContent = t.ru;
      var flipped = false;
      card.addEventListener("click", function () {
        flipped = !flipped;
        card.textContent = flipped ? t.en : t.ru;
        card.classList.toggle("flipped", flipped);
      });
      var hint = document.createElement("p");
      hint.className = "muted";
      hint.textContent = "Нажмите на карточку, чтобы перевернуть. Пройдено " + seen + ", знаю " + known + ".";
      var row = document.createElement("div");
      row.className = "article-actions";
      [["Знаю", true], ["Повторить", false]].forEach(function (b) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = b[1] ? "btn" : "btn btn-ghost";
        btn.textContent = b[0];
        btn.addEventListener("click", function () {
          seen++;
          if (b[1]) known++; else terms.push(t);
          i++;
          cards();
        });
        row.appendChild(btn);
      });
      area.appendChild(card);
      area.appendChild(hint);
      area.appendChild(row);
    }

    function quiz() {
      area.innerHTML = "";
      var t = terms[i % terms.length];
      var options = shuffle([t].concat(shuffle(terms.filter(function (x) { return x.en !== t.en; })).slice(0, 3)));
      var p = document.createElement("p");
      p.textContent = "Как по-английски: «" + t.ru + "»?";
      area.appendChild(p);
      var fb = document.createElement("p");
      fb.className = "feedback";
      options.forEach(function (o) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = "btn btn-ghost option-btn";
        b.textContent = o.en;
        b.addEventListener("click", function () {
          var ok = o.en === t.en;
          seen++;
          if (ok) known++;
          fb.textContent = (ok ? "Верно. " : "Неверно. Правильно: " + t.en + ". ") + "Счёт " + known + " из " + seen + ".";
          fb.className = "feedback " + (ok ? "ok" : "bad");
          area.querySelectorAll(".option-btn").forEach(function (x) { x.disabled = true; });
          next.hidden = false;
        });
        area.appendChild(b);
      });
      area.appendChild(fb);
      var next = document.createElement("button");
      next.type = "button";
      next.className = "btn";
      next.textContent = "Следующий термин";
      next.hidden = true;
      next.addEventListener("click", function () { i++; quiz(); });
      area.appendChild(next);
    }

    function render() { (mode === "cards" ? cards : quiz)(); }

    document.querySelectorAll("[data-fc-mode]").forEach(function (b) {
      b.addEventListener("click", function () {
        mode = b.dataset.fcMode;
        document.querySelectorAll("[data-fc-mode]").forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); });
        i = 0; known = 0; seen = 0;
        render();
      });
    });

    fetch(P("/glossary.json")).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    }).then(function (list) {
      terms = shuffle(list.slice());
      render();
    }).catch(function () {
      area.textContent = "Не удалось загрузить термины.";
    });
  }

  var QUIZ_SETS = {
    meteo: [
      {
        data: "Давление за 3 часа упало с 1012 до 1004 гПа. Перистые облака с запада уплотняются.",
        q: "Что вероятнее всего?",
        options: ["Погода улучшится", "Приближается циклон или фронт, ветер усилится", "Изменений не будет"],
        answer: 1,
        explain: "Быстрое падение давления и уплотнение облаков — признаки приближения циклона или тёплого фронта."
      },
      {
        data: "Температура воздуха 9 °C, точка росы 8 °C. Судно входит в район с более холодной водой.",
        q: "Чего ожидать?",
        options: ["Тумана и ухудшения видимости", "Грозы", "Резкого роста давления"],
        answer: 0,
        explain: "Разница температуры и точки росы мала, холодная вода охладит воздух до точки росы — вероятен туман."
      },
      {
        data: "На метеокарте изобары рядом с маршрутом расположены очень густо.",
        q: "Что это значит?",
        options: ["Штиль", "Сильный ветер", "Туман"],
        answer: 1,
        explain: "Густые изобары означают большой перепад давления и сильный ветер."
      },
      {
        data: "Резко усилился порывистый ветер, прошёл ливень, ветер повернул, давление начало расти.",
        q: "Что произошло?",
        options: ["Прошёл холодный фронт", "Подходит тёплый фронт", "Начался антициклон без изменений"],
        answer: 0,
        explain: "Ливень, порывы, поворот ветра и рост давления после него характерны для прохождения холодного фронта."
      },
      {
        data: "Северное полушарие. Вы стоите лицом к ветру.",
        q: "Где центр низкого давления (по правилу Бейс-Балло)?",
        options: ["Слева впереди", "Справа и немного сзади", "Прямо по ветру"],
        answer: 1,
        explain: "В Северном полушарии, если стоять лицом к ветру, низкое давление справа и немного сзади."
      }
    ],
    instruments: [
      {
        data: "Эхолот показывает 9,5 м. Датчик установлен на 1,2 м выше киля. Осадка 8 м.",
        q: "Какая глубина под килем?",
        options: ["9,5 м", "8,3 м", "10,7 м", "1,5 м"],
        answer: 1,
        explain: "Эхолот меряет от датчика. Киль на 1,2 м ниже датчика, значит под килем 9,5 − 1,2 = 8,3 м. Осадка здесь не нужна: она понадобится, чтобы найти полную глубину от поверхности (8,3 + 8 = 16,3 м)."
      },
      {
        data: "Лаг относительно воды показывает 12 узлов, GNSS — скорость над грунтом 9 узлов, курс и путевой угол совпадают.",
        q: "Что это значит?",
        options: ["Лаг неисправен", "Встречное течение около 3 узлов", "Попутное течение 3 узла"],
        answer: 1,
        explain: "Скорость над грунтом меньше скорости по воде при совпадающих направлениях — встречное течение."
      },
      {
        data: "Гирокомпас показывает 090°, магнитный компас 095°. Общая поправка магнитного компаса по таблице −5°.",
        q: "Как оценить показания?",
        options: ["Компасы согласуются", "Гирокомпас ошибается на 5°", "Нужно срочно останавливать судно"],
        answer: 0,
        explain: "ИК по магнитному = 095° + (−5°) = 090°, что совпадает с гирокомпасом."
      },
      {
        data: "ARPA: цель CPA 0,1 мили, TCPA 12 минут, пеленг почти не меняется.",
        q: "Что делать?",
        options: ["Ничего, CPA больше нуля", "Оценить ситуацию по правилам и заблаговременно маневрировать", "Ждать вызова по УКВ"],
        answer: 1,
        explain: "CPA почти ноль и постоянный пеленг — риск столкновения. Нужны действия по МППСС."
      },
      {
        data: "ECDIS показывает судно на линии маршрута, но визуальные пеленги дают место в 0,5 мили от линии.",
        q: "Как поступить?",
        options: ["Доверять ECDIS", "Проверить место другими способами, подозревать ошибку GNSS, доложить капитану", "Выключить ECDIS"],
        answer: 1,
        explain: "ECDIS берёт место от GNSS. Если независимые способы расходятся, нужно проверить и действовать в сторону безопасности."
      }
    ]
  };

  function initQuizSets() {
    document.querySelectorAll("[data-quiz-set]").forEach(function (box) {
      var items = QUIZ_SETS[box.dataset.quizSet];
      if (!items) return;
      var idx = 0, score = 0;
      function render() {
        box.innerHTML = "";
        if (idx >= items.length) {
          var res = document.createElement("p");
          res.className = "result";
          res.textContent = "Итог: " + score + " из " + items.length + ".";
          var again = document.createElement("button");
          again.type = "button";
          again.className = "btn btn-ghost";
          again.textContent = "Пройти заново";
          again.addEventListener("click", function () { idx = 0; score = 0; render(); });
          box.appendChild(res);
          box.appendChild(again);
          return;
        }
        var it = items[idx];
        var meta = document.createElement("p");
        meta.className = "muted";
        meta.textContent = "Ситуация " + (idx + 1) + " из " + items.length;
        var data = document.createElement("p");
        data.className = "situation-data";
        data.textContent = it.data;
        var q = document.createElement("p");
        q.textContent = it.q;
        box.appendChild(meta);
        box.appendChild(data);
        box.appendChild(q);
        var fb = document.createElement("p");
        fb.className = "feedback";
        var next = document.createElement("button");
        next.type = "button";
        next.className = "btn";
        next.textContent = idx < items.length - 1 ? "Следующая ситуация" : "Итог";
        next.hidden = true;
        next.addEventListener("click", function () { idx++; render(); });
        it.options.forEach(function (o, i) {
          var b = document.createElement("button");
          b.type = "button";
          b.className = "btn btn-ghost option-btn";
          b.textContent = o;
          b.addEventListener("click", function () {
            var ok = i === it.answer;
            if (ok) score++;
            fb.textContent = (ok ? "Верно. " : "Неверно. ") + it.explain;
            fb.className = "feedback " + (ok ? "ok" : "bad");
            box.querySelectorAll(".option-btn").forEach(function (x) { x.disabled = true; });
            next.hidden = false;
          });
          box.appendChild(b);
        });
        box.appendChild(fb);
        box.appendChild(next);
      }
      render();
    });
  }

  function initStability() {
    var card = document.querySelector('[data-trainer="stability"]');
    if (!card) return;
    var inputs = card.querySelectorAll("[data-stab]");
    var result = card.querySelector("[data-stab-result]");
    function update() {
      var v = {};
      inputs.forEach(function (i) { v[i.dataset.stab] = parseFloat(i.value); });
      if (isNaN(v.km) || isNaN(v.kg) || isNaN(v.fsc)) {
        result.textContent = "Введите числа.";
        return;
      }
      var gm = v.km - v.kg - v.fsc;
      result.textContent = "GM = " + gm.toFixed(2) + " м. " +
        (gm > 0 ? "Судно остойчиво в этой модели." : "GM не положительна: судно неостойчиво в этой модели.");
    }
    inputs.forEach(function (i) { i.addEventListener("input", update); });
    update();
  }

  document.addEventListener("DOMContentLoaded", function () {
    var sidebar = document.getElementById("sidebar");
    if (sidebar && !window.matchMedia("(min-width: 900px)").matches) sidebar.open = false;
    recordVisit();
    refreshArticleButtons();
    initDocumentActions();
    initHome();
    initSearch();
    initProgressPage();
    initGlossary();
    initCalculators();
    initTests();
    initPager();
    initImport();
    initBuoyancy();
    initRoutes();
    initSchema();
    initColreg();
    initCoords();
    initStability();
    initChart();
    initSituations();
    initBridge();
    initChecklists();
    initBackupButtons();
    initDataPage();
    initHomeExtras();
    initMotion();
    initFlashcards();
    initQuizSets();
  });
})();

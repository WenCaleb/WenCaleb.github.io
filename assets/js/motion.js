/*
 * WenCaleb 全站动效 —— GSAP + ScrollTrigger（本地自托管，与页面逻辑分离）
 *
 * 页面侧只做标记，本脚本统一认领：
 *   .reveal                  → 淡入上移（intro 范围内的进开场时间轴，其余走 ScrollTrigger）
 *   .line-mask > .line       → 整行遮罩揭开（英文大标题）
 *   [data-motion="chars"]    → 逐字遮罩进场（hero 名字 / 页面大标题）
 *   .img-reveal              → 图片揭幕（clip-path 自下而上 + 内图 scale 归位）
 *   [data-parallax]          → 轻微视差（仅桌面；被 data-band-pin 接管的除外）
 *   .preloader               → 首页全屏开场（桌面 ~1.5s；移动端直接跳过）
 *   .marquee-track.motion    → GSAP 驱动跑马灯（xPercent 线性循环；CSS 循环同时关闭，
 *                              无 ST 时把 .motion 撤掉、退回 CSS keyframes）
 *   [data-scramble]          → 页脚巨型 wordmark 滚动进视口时 scramble 解码一次（仅 ST）
 *   [data-band-pin]          → 横幅图钉住 + scrub 缩放归位/暗化（仅桌面，取代原视差）
 *   [data-links-pin]         → links 区块钉住：标题让位 + 行 stagger 滑入（仅桌面）
 *   #clock[data-clock-flip]  → 时钟数字跳动时轻微 y 翻转
 *
 * 滚动引擎：Lenis（assets/vendor/lenis.min.js）。缺失或初始化失败时静默跳过，
 *   退回浏览器原生滚动。
 *
 * 降级保证（三层）：
 *   1. 无 JS / prefers-reduced-motion：html 上没有 .motion 类，CSS 默认全部可见，
 *      预载层永不显示，自动轮播不启动，跑马灯走 CSS keyframes；
 *   2. GSAP 加载失败 / 本脚本报错：加 .motion-off，CSS 强制全部可见并移除预载层，
 *      跑马灯 CSS 循环经 .motion-off .marquee-track.motion 恢复；
 *   3. 本脚本压根没启动（极端情况）：各页底部兜底定时器在 load 后加 .motion-off。
 *
 * 可选插件：ScrollTrigger（缺失时全部滚动效果直接显示，跑马灯 / scramble / pin 退回静态）。
 * 逐字遮罩为手写 splitChars，不依赖 SplitText 插件；窄屏中文标题换行由
 *   CSS 手动断行处理（见各页 .line-mask 结构），本脚本按整行补间。
 */
window.__motionStarted = true;
(function () {
  'use strict';

  var root = document.documentElement;
  var heroRescramble = null; /* hero 名字低频重解码的 interval（mm 重入 / bail 时清理） */

  /* —— 降级出口：显示一切、撤掉遮挡 —— */
  function bail() {
    root.classList.add('motion-off');
    if (heroRescramble) clearInterval(heroRescramble);
    var pre = document.querySelector('.preloader');
    if (pre && pre.parentNode) pre.parentNode.removeChild(pre);
  }

  /* reduce 用户：html 上本就没有 .motion（页头内联脚本控制），直接退出 */
  if (!root.classList.contains('motion')) return;
  if (!window.gsap) { bail(); return; }

  try {
    var hasST = !!window.ScrollTrigger;
    if (hasST) gsap.registerPlugin(ScrollTrigger);

    /* ================================================================
       第零部分：Lenis 平滑滚动（可选增强）
       - 脚本缺失 / 初始化报错 → 静默跳过，退回原生滚动，绝不影响内容
       - 与 ScrollTrigger 打通：Lenis 负责驱动滚动，ST 只同步位置
       ================================================================ */
    var lenis = null;
    if (typeof window.Lenis === 'function') {
      try {
        lenis = new window.Lenis({
          duration: 1.1,
          smoothWheel: true,
          wheelMultiplier: 1,
          touchMultiplier: 1.6
        });
        if (hasST) lenis.on('scroll', ScrollTrigger.update);
        gsap.ticker.add(function (time) { lenis.raf(time * 1000); });
        gsap.ticker.lagSmoothing(0);
        window.__lenis = lenis; /* 供页内脚本（如复习弹窗）暂停 / 恢复滚动 */

        /* 站内锚点交给 Lenis 平滑滚动；.skip 跳转链接保持原生行为（可访问性） */
        document.addEventListener('click', function (e) {
          var a = e.target && e.target.closest ? e.target.closest('a[href^="#"]') : null;
          if (!a || a.classList.contains('skip')) return;
          var hash = a.getAttribute('href');
          if (!hash || hash === '#') return;
          var target = document.querySelector(hash);
          if (!target) return;
          e.preventDefault();
          lenis.scrollTo(target, { duration: 1.1 });
        });
      } catch (err) {
        lenis = null;
      }
    }

    var EASE = 'power4.out';
    var INTRO_SCOPE = '.hero, .page-head, .read-head';

    /*
     * 逐字/整行遮罩进场的统一参数。
     * 关键点：CSS 里 .char/.line 初始是 translateY(115%)，GSAP 会把它解析成 y(px)，
     * 如果只补间 yPercent，CSS 的 px 位移会残留。所以 from/to 里显式带上 y:0。
     */
    var CHARS_FROM = { yPercent: 115, y: 0 };
    var CHARS_TO = { yPercent: 0, y: 0 };

    /* —— 把文本拆成逐字遮罩结构，返回字符 span 数组（幂等） —— */
    function splitChars(el) {
      if (!el || el.dataset.charDone) return [];
      var text = el.textContent;
      el.dataset.charDone = '1';
      el.setAttribute('aria-label', text);
      var frag = document.createDocumentFragment();
      var list = [];
      Array.prototype.forEach.call(text, function (ch) {
        var wrap = document.createElement('span');
        wrap.className = 'char-wrap';
        wrap.setAttribute('aria-hidden', 'true');
        var c = document.createElement('span');
        c.className = 'char';
        c.textContent = (ch === ' ') ? '\u00A0' : ch;
        wrap.appendChild(c);
        frag.appendChild(wrap);
        list.push(c);
      });
      el.textContent = '';
      el.appendChild(frag);
      return list;
    }

    /* —— 首页图片轮播：开场结束后才启动（由时间轴 call，而非 setTimeout） —— */
    function startCarousel() {
      var imgs = Array.prototype.slice.call(document.querySelectorAll('.hero-img'));
      if (imgs.length < 2) return;
      var idx = 0;
      setInterval(function () {
        if (document.hidden) return;
        imgs[idx].classList.remove('is-active');
        idx = (idx + 1) % imgs.length;
        imgs[idx].classList.add('is-active');
      }, 5500);
    }

    /* ================================================================
       第一部分：首屏进场（首页开场 / 子页页头）
       ================================================================ */
    function intro(desk) {
      var tl = gsap.timeline({ defaults: { ease: EASE } });
      var pre = document.querySelector('.preloader');
      var hero = document.querySelector('.hero');
      var head = document.querySelector('.page-head, .read-head');
      var nav = document.querySelector('.hero-nav, .nav');
      var heroItems, headItems, nameChars, firstImg;

      if (pre && hero) {
        /* —— 首页：完整 opening animation（同一标签页会话只播一次） —— */
        var seen = false;
        try { seen = sessionStorage.getItem('wc-opening') === '1'; } catch (e) { /* 隐私模式等：当作没看过 */ }

        if (desk && !seen) {
          try { sessionStorage.setItem('wc-opening', '1'); } catch (e) { /* 忽略 */ }
          var markChars = splitChars(pre.querySelector('.preloader-mark'));
          var fill = pre.querySelector('.preloader-fill');
          if (markChars.length) {
            tl.fromTo(markChars, CHARS_FROM, { yPercent: 0, y: 0, duration: 0.55, stagger: 0.028 }, 0);
          }
          if (fill) {
            tl.fromTo(fill, { scaleX: 0 }, { scaleX: 1, duration: 0.7, ease: 'power2.inOut' }, 0.08);
          }
          /* 遮罩整体上移揭开 */
          tl.to(pre, { yPercent: -100, duration: 0.85, ease: 'power4.inOut' }, 0.9);
          tl.set(pre, { display: 'none' });
          tl.add('hero', 1.3);
        } else {
          /* 移动端跳过全屏预载层；桌面端同一会话刷新也不再播，走轻量进场 */
          pre.style.display = 'none';
          tl.add('hero', 0.05);
        }

        nameChars = splitChars(hero.querySelector('.hero-name'));
        heroItems = Array.prototype.slice.call(hero.querySelectorAll('.reveal'));
        firstImg = hero.querySelector('.hero-img.is-active');

        /* hero 图片轻微 scale 归位（不碰 opacity，避免和轮播的类切换打架） */
        if (firstImg) {
          tl.fromTo(firstImg,
            { scale: desk ? 1.06 : 1.04 },
            { scale: 1, duration: desk ? 1.5 : 0.9, ease: 'power3.out', clearProps: 'scale' },
            'hero');
        }
        /* 名字逐字遮罩进场 */
        if (nameChars.length) {
          tl.fromTo(nameChars, CHARS_FROM,
            { yPercent: 0, y: 0, duration: desk ? 0.9 : 0.7, stagger: desk ? 0.04 : 0.028 },
            'hero+=0.05');
        }
        /* 低频重解码：开场 ~2s 后开始，每 ~18s 把 hero 名字 scramble 一遍
           （gsap.com 式，克制不吵）；仅当名字在视口内才执行 */
        if (desk && nameChars.length && nameChars.length <= 24) {
          var heroNameEl = hero.querySelector('.hero-name');
          var heroText = heroNameEl ? heroNameEl.textContent : '';
          heroRescramble = setInterval(function () {
            if (document.hidden || !heroNameEl) return;
            var r = heroNameEl.getBoundingClientRect();
            if (r.bottom < 0 || r.top > window.innerHeight) return;
            scrambleChars(nameChars, heroText, 1.0);
          }, 18000);
        }
        /* 卡片、导航等依次淡入 */
        if (heroItems.length) {
          tl.to(heroItems, {
            opacity: 1, y: 0, duration: 0.8,
            stagger: desk ? 0.09 : 0.06, clearProps: 'transform'
          }, 'hero+=0.15');
        }
        /* 开场收尾后再启动轮播计时 */
        tl.call(startCarousel, null, desk ? 'hero+=0.5' : 'hero+=0.9');

      } else if (head) {
        /* —— 子页：无预载层，页头轻量进场 —— */
        var title = head.querySelector('.page-title, .read-title');
        var titleChars = splitChars(title);
        headItems = Array.prototype.slice.call(head.querySelectorAll('.reveal'));

        tl.add('h', 0.05);
        if (nav) tl.to(nav, { opacity: 1, y: 0, duration: 0.7 }, 'h');
        if (titleChars.length) {
          tl.fromTo(titleChars, CHARS_FROM,
            { yPercent: 0, y: 0, duration: desk ? 0.95 : 0.75, stagger: desk ? 0.045 : 0.03 },
            'h+=0.05');
        }
        if (headItems.length) {
          tl.to(headItems, {
            opacity: 1, y: 0, duration: 0.8, stagger: 0.1, clearProps: 'transform'
          }, 'h+=0.2');
        }
      }
    }

    /* ================================================================
       第二部分：滚动动效（intro 范围之外的 .reveal、行遮罩、图片、视差）
       ================================================================ */
    function scrollFx(desk) {
      if (!hasST) {
        /* 没有 ScrollTrigger：全部直接显示，不许有内容藏着 */
        gsap.set('.reveal', { opacity: 1, y: 0 });
        gsap.set('.line', { yPercent: 0 });
        gsap.set('.img-reveal', { clipPath: 'inset(-1% -1% -1% -1%)' });
        gsap.set('.img-reveal img', { scale: 1 });
        return;
      }

      /* —— 区块内元素：依次 stagger 淡入（intro 范围外） ——
         [data-links-pin] 区块里的 .row / .sec-display 交给 pin 时间轴独占驱动
         （pinFx），若同时进批量淡入，两条补间都会写 opacity/y/yPercent，
         且批量淡入的 clearProps:'transform' 会清掉 pin 的 scrub 值，必须排除。
         注意：只有桌面端才建 pin 时间轴；移动端 pin 不跑，.row 必须留在
         批量淡入名单里，否则会永远藏起来 */
      var pinSec = desk ? document.querySelector('[data-links-pin]') : null;
      var pinSkip = pinSec ? Array.prototype.slice.call(pinSec.querySelectorAll('.row, .sec-display')) : [];
      var rest = Array.prototype.slice.call(document.querySelectorAll('.reveal')).filter(function (el) {
        if (el.closest(INTRO_SCOPE)) return false;
        for (var k = 0; k < pinSkip.length; k++) { if (el === pinSkip[k]) return false; }
        return true;
      });
      if (rest.length) {
        ScrollTrigger.batch(rest, {
          start: 'top 92%',
          once: true,
          onEnter: function (batch) {
            gsap.to(batch, {
              opacity: 1, y: 0, duration: 0.9, ease: EASE,
              stagger: 0.08, overwrite: true, clearProps: 'transform'
            });
          }
        });
        /* 保险：最贴近页面底部的元素可能永远够不到触发线（差一像素的坑），
           滚到接近底部时把还没显示的全部显示出来 */
        ScrollTrigger.create({
          start: function () { return ScrollTrigger.maxScroll(window) - 2; },
          end: function () { return ScrollTrigger.maxScroll(window); },
          once: true,
          onEnter: function () {
            var hidden = rest.filter(function (el) {
              return parseFloat(getComputedStyle(el).opacity) < 1;
            });
            if (hidden.length) {
              gsap.to(hidden, {
                opacity: 1, y: 0, duration: 0.6, ease: EASE,
                stagger: 0.05, overwrite: true, clearProps: 'transform'
              });
            }
          }
        });
      }

      /* —— 英文大标题：整行遮罩揭开 ——
         [data-links-pin] 区块里的 .line 交给 pin 时间轴独占驱动（它驱动外层
         .sec-display），不再单独补间，避免内外两层 transform 叠加打架 */
      var pinSec2 = document.querySelector('[data-links-pin]');
      Array.prototype.forEach.call(document.querySelectorAll('.line-mask .line'), function (line) {
        if (pinSec2 && pinSec2.contains(line)) return;
        gsap.fromTo(line, CHARS_FROM, {
          yPercent: 0, y: 0, duration: 1.1, ease: EASE,
          scrollTrigger: { trigger: line.closest('.line-mask'), start: 'top 88%', once: true }
        });
      });

      /* —— 图片揭幕：遮罩自下而上 + 内图 scale 归位 ——
         band（[data-parallax] 图）跳过内图 scale：视差的 scale 1.12 与揭幕归位
         会互相覆盖，band 的呼吸感由 clip 揭幕单独承担 */
      Array.prototype.forEach.call(document.querySelectorAll('.img-reveal'), function (fig) {
        var img = fig.querySelector('img');
        var st = { trigger: fig, start: 'top 85%', once: true };
        gsap.fromTo(fig, { clipPath: 'inset(0 0 100% 0)' }, {
          clipPath: 'inset(0 0 0% 0)', duration: 1.15, ease: 'power4.inOut', scrollTrigger: st
        });
        if (img && !fig.hasAttribute('data-parallax')) {
          gsap.fromTo(img, { scale: 1.18 }, {
            scale: 1, duration: 1.6, ease: 'power3.out',
            scrollTrigger: { trigger: fig, start: 'top 85%', once: true }
          });
        }
      });

      /* —— 轻微视差：仅桌面（移动端关闭，约束 Q8）。
         标记在容器上（band / [data-parallax]），对容器内的 img 做缩放漂移，
         避免对 position:fixed 叠层生效 —— 元素本身是视口固定的，位移无意义 */
      if (desk) {
        Array.prototype.forEach.call(document.querySelectorAll('[data-parallax]'), function (fig) {
          if (fig.hasAttribute('data-band-pin')) return; /* band-pin 接管（钉住 + scale scrub） */
          var target = fig.querySelector('img') || fig;
          gsap.fromTo(target, { yPercent: -5, scale: 1.12 }, {
            yPercent: 5, scale: 1.12, ease: 'none',
            scrollTrigger: { trigger: fig, start: 'top bottom', end: 'bottom top', scrub: true }
          });
        });
      }

      /* —— 滚动区的大字 wordmark：逐字进场（intro 范围内的不重复处理） —— */
      Array.prototype.forEach.call(document.querySelectorAll('[data-motion="chars"]'), function (el) {
        if (el.closest(INTRO_SCOPE) || el.dataset.charDone) return;
        var cs = splitChars(el);
        if (!cs.length) return;
        ScrollTrigger.create({
          trigger: el, start: 'top 92%', once: true,
          onEnter: function () {
            gsap.fromTo(cs, CHARS_FROM, {
              yPercent: 0, y: 0, duration: 1, stagger: 0.035, ease: EASE
            });
          }
        });
      });

      ScrollTrigger.refresh();
    }

    /* ================================================================
       第三部分：GSAP 化跑马灯（gsap.com 式）
       - 轨道（.marquee-track.motion）交给 GSAP：xPercent -50 线性无限循环
       - 无 ScrollTrigger（ST 缺失等降级路径）：退回 CSS keyframes，一行代码都不用写
       - 桌面/移动端都跑（marquee 是纯装饰，移动设备也保留）
       ================================================================ */
    function marqueeFx(desk) {
      var tracks = Array.prototype.slice.call(document.querySelectorAll('.marquee-track.motion'));
      if (!tracks.length) return;
      if (!hasST) {
        /* 无 ST：CSS 循环兜底（site-ui.css 的 @keyframes marquee-x） */
        tracks.forEach(function (tr) { tr.classList.remove('motion'); });
        return;
      }
      tracks.forEach(function (track) {
        /* 速度：data-marquee-duration 放在外层 .marquee 上（与 CSS 同名属性呼应） */
        var box = track.parentElement;
        var dur = parseFloat(box ? box.getAttribute('data-marquee-duration') : null);
        if (!dur || isNaN(dur)) dur = 26;
        /* 两个 group 内容必须等宽（-50% 无缝点）；若第一组带 data-marquee-items，
           用它的 innerHTML 重写第二组，保证任意文案下都无缝 */
        var grp = track.children[0];
        if (grp && grp.getAttribute('data-marquee-items') && track.children[1] && track.children[1].tagName === 'DIV') {
          track.children[1].innerHTML = grp.innerHTML;
        }
        /* 线性无限循环（gsap.com 经典写法；先清旧补间防 mm 重入双份） */
        gsap.killTweensOf(track);
        var loop = gsap.to(track, { xPercent: -50, ease: 'none', duration: dur, repeat: -1 });
        /* 桌面悬停：平滑减速到停（gsap.com 式 timeScale，替代 CSS 硬暂停）；
           只有精确指针设备才有 hover，触屏自动跳过。重入时移除旧监听、
           换绑到新 loop，避免悬停减速作用在被杀掉的旧补间上 */
        if (desk && box) {
          if (box.__marqueeHover) box.removeEventListener('mouseenter', box.__marqueeHover);
          if (box.__marqueeLeave) box.removeEventListener('mouseleave', box.__marqueeLeave);
          box.__marqueeHover = function () {
            gsap.to(loop, { timeScale: 0, duration: 0.5, ease: 'power2.out', overwrite: true });
          };
          box.__marqueeLeave = function () {
            gsap.to(loop, { timeScale: 1, duration: 0.8, ease: 'power2.inOut', overwrite: true });
          };
          box.addEventListener('mouseenter', box.__marqueeHover);
          box.addEventListener('mouseleave', box.__marqueeLeave);
        }
      });
    }

    /* ================================================================
       第四部分：scramble 解码文字（gsap.com 式，手写实现，无需插件）
       - gsap.to(progress) 控制"已锁定字符数"，未锁定的用随机字符池刷新，
         锁定后保持原文字形
       - 目标：[data-scramble]（页脚巨型 wordmark）滚动进视口时解码一次
       - 降级：无 ST 时不触发，原文保留，天然安全
       ================================================================ */
    var SCRAMBLE_CHARS = '▓▒░#@%&*WENCLB0147/\\<>';
    /* 字符列表版：用于已经拆好的逐字 span（hero 名字 / 页标题），
       低频重解码时把字符文本换成随机池，再从左到右逐个锁定回原文 */
    function scrambleChars(chList, text, duration) {
      var state = { p: 0 };
      gsap.to(state, {
        p: 1,
        duration: duration || 1.2,
        ease: 'power1.inOut',
        onUpdate: function () {
          var locked = Math.floor(state.p * text.length);
          for (var j = 0; j < chList.length; j++) {
            var want = text[j] === ' ' ? '\u00A0' : text[j];
            if (j < locked) {
              if (chList[j].textContent !== want) chList[j].textContent = want;
            } else if (document.visibilityState !== 'hidden') {
              chList[j].textContent = SCRAMBLE_CHARS.charAt(Math.floor(Math.random() * SCRAMBLE_CHARS.length));
            }
          }
        },
        onComplete: function () {
          for (var j = 0; j < chList.length; j++) chList[j].textContent = text[j] === ' ' ? '\u00A0' : text[j];
        }
      });
    }
    function scrambleText(el, duration) {
      if (el.dataset.scrambleDone) return;
      el.dataset.scrambleDone = '1';
      var finalText = el.textContent;
      var len = finalText.length;
      var state = { p: 0 };
      var spans = [];
      el.setAttribute('aria-label', finalText);
      el.textContent = '';
      for (var i = 0; i < len; i++) {
        var s = document.createElement('span');
        s.setAttribute('aria-hidden', 'true');
        s.style.display = 'inline-block';
        s.textContent = finalText[i] === ' ' ? '\u00A0' : SCRAMBLE_CHARS.charAt(Math.floor(Math.random() * SCRAMBLE_CHARS.length));
        el.appendChild(s);
        spans.push(s);
      }
      gsap.to(state, {
        p: 1,
        duration: duration || 1.6,
        ease: 'power1.inOut',
        onUpdate: function () {
          var locked = Math.floor(state.p * len);
          for (var j = 0; j < len; j++) {
            var want = finalText[j] === ' ' ? '\u00A0' : finalText[j];
            if (j < locked) {
              if (spans[j].textContent !== want) spans[j].textContent = want;
            } else if (document.visibilityState !== 'hidden') {
              spans[j].textContent = SCRAMBLE_CHARS.charAt(Math.floor(Math.random() * SCRAMBLE_CHARS.length));
            }
          }
        },
        onComplete: function () {
          for (var j = 0; j < len; j++) spans[j].textContent = finalText[j] === ' ' ? '\u00A0' : finalText[j];
        }
      });
    }
    function scrambleFx() {
      var targets = Array.prototype.slice.call(document.querySelectorAll('[data-scramble]'));
      if (!targets.length || !hasST) return; /* 无 ST：保持原文 */
      targets.forEach(function (el) {
        ScrollTrigger.create({
          trigger: el, start: 'top 95%', once: true,
          onEnter: function () { scrambleText(el, 1.6); }
        });
      });
    }

    /* ================================================================
       第五部分：pinned scrub 时间轴（仅桌面，gsap.com 式）
       - [data-band-pin]：横幅图钉住 ~1.2 屏，scrub 驱动 scale 1.28→1 + 轻微暗化，
         取代原来的轻微视差（钉住方案更有质感）
       - [data-links-pin]：links 区块钉住，标题自下而上滑出、行依次 stagger 滑入
       - 移动端 mm 上下文中跳过，避免 pin 改变页面总高度带来的坑
       ================================================================ */
    function pinFx(desk) {
      if (!desk || !hasST) return;
      /* —— band：钉住 + 缩放归位 + 暗化消隐 —— */
      Array.prototype.forEach.call(document.querySelectorAll('[data-band-pin]'), function (fig) {
        var img = fig.querySelector('img') || fig;
        fig.style.overflow = 'hidden';
        var tl = gsap.timeline({
          scrollTrigger: {
            trigger: fig, start: 'top top', end: '+=0.8',
            pin: true, scrub: 0.6, anticipatePin: 1
          }
        });
        tl.fromTo(img, { scale: 1.28 }, { scale: 1, ease: 'none' }, 0);
        tl.to(img, { opacity: 0.55, filter: 'grayscale(1) contrast(1.05) brightness(0.6)', ease: 'none' }, 0);
      });
      /* —— links：钉住一屏，标题压顶后让位，行依次滑入 —— */
      var linksSec = document.querySelector('[data-links-pin]');
      if (linksSec) {
        var secTitle = linksSec.querySelector('.sec-display');
        var secRows = Array.prototype.slice.call(linksSec.querySelectorAll('.row'));
        var tl2 = gsap.timeline({
          scrollTrigger: {
            trigger: linksSec, start: 'top top', end: '+=0.8',
            pin: true, scrub: 0.5, anticipatePin: 1
          }
        });
        if (secTitle) {
          tl2.fromTo(secTitle, { yPercent: 100 }, { yPercent: 0, ease: 'none' }, 0);
          tl2.to(secTitle, { yPercent: -60, ease: 'none' }, 0.25); /* 标题让位给内容 */
        }
        if (secRows.length) {
          tl2.fromTo(secRows, { yPercent: 60, y: 0, opacity: 0 }, {
            yPercent: 0, y: 0, opacity: 1, ease: 'none', stagger: 0.08
          }, 0.1);
        }
      }
    }

    /* ================================================================
       第六部分：微交互点缀（低成本）
       - 表格行 hover：箭头 ↗ 右移 4px + 行底色微变（纯 CSS，见 site-ui.css）
       - 时钟数字跳动：[data-clock-flip] 每秒 y 翻转 150ms
       ================================================================ */
    function clockFx() {
      var clock = document.querySelector('#clock[data-clock-flip]');
      if (!clock) return;
      var prev = clock.textContent;
      var timer = null;
      function tick() {
        if (clock.textContent !== prev) {
          prev = clock.textContent;
          gsap.fromTo(clock, { y: 8 }, { y: 0, duration: 0.18, ease: 'power2.out', clearProps: 'transform' });
        }
      }
      function start() {
        if (!timer) timer = setInterval(tick, 500);
      }
      /* 页面隐藏时不折腾，回来时再恢复 */
      document.addEventListener('visibilitychange', function () {
        if (document.hidden) {
          clearInterval(timer);
          timer = null;
        } else {
          start();
        }
      });
      start();
    }

    /* ================================================================
       响应式调度：桌面全量 / 移动端轻量（gsap.matchMedia 显式处理，
       减少动态场景在入口处已排除，不会走到这里）
       ================================================================ */
    var mm = gsap.matchMedia();
    mm.add({
      desk: '(min-width: 48em) and (prefers-reduced-motion: no-preference)',
      mobile: '(max-width: 47.9937em) and (prefers-reduced-motion: no-preference)'
    }, function (ctx) {
      var desk = ctx.conditions.desk;
      /* mm 重入（断点变化）时清掉上一轮的 hero 重解码计时器，防止双份 */
      if (heroRescramble) { clearInterval(heroRescramble); heroRescramble = null; }
      intro(desk);
      scrollFx(desk);
      marqueeFx(desk);
      scrambleFx();
      pinFx(desk);
      clockFx();
    });

  } catch (err) {
    bail();
  }
})();

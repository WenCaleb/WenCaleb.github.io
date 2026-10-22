/*
 * WenCaleb 全站动效 —— GSAP + ScrollTrigger（本地自托管，与页面逻辑分离）
 *
 * 页面侧只做标记，本脚本统一认领：
 *   .reveal                  → 淡入上移（intro 范围内的进开场时间轴，其余走 ScrollTrigger）
 *   .line-mask > .line       → 整行遮罩揭开（英文大标题）
 *   [data-motion="chars"]    → 逐字遮罩进场（hero 名字 / 页面大标题 / footer wordmark）
 *   .img-reveal              → 图片揭幕（clip-path 自下而上 + 内图 scale 归位）
 *   [data-parallax]          → 轻微视差（仅桌面）
 *   .preloader               → 首页全屏开场（桌面 ~1.5s；移动端直接跳过）
 *
 * 降级保证（三层）：
 *   1. 无 JS / prefers-reduced-motion：html 上没有 .motion 类，CSS 默认全部可见，
 *      预载层永不显示，自动轮播不启动；
 *   2. GSAP 加载失败 / 本脚本报错：加 .motion-off，CSS 强制全部可见并移除预载层；
 *   3. 本脚本压根没启动（极端情况）：各页底部兜底定时器在 load 后加 .motion-off。
 */
window.__motionStarted = true;
(function () {
  'use strict';

  var root = document.documentElement;

  /* —— 降级出口：显示一切、撤掉遮挡 —— */
  function bail() {
    root.classList.add('motion-off');
    var pre = document.querySelector('.preloader');
    if (pre && pre.parentNode) pre.parentNode.removeChild(pre);
  }

  /* reduce 用户：html 上本就没有 .motion（页头内联脚本控制），直接退出 */
  if (!root.classList.contains('motion')) return;
  if (!window.gsap) { bail(); return; }

  try {
    var hasST = !!window.ScrollTrigger;
    if (hasST) gsap.registerPlugin(ScrollTrigger);

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

      /* —— 区块内元素：依次 stagger 淡入（intro 范围外） —— */
      var rest = Array.prototype.slice.call(document.querySelectorAll('.reveal')).filter(function (el) {
        return !el.closest(INTRO_SCOPE);
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

      /* —— 英文大标题：整行遮罩揭开 —— */
      Array.prototype.forEach.call(document.querySelectorAll('.line-mask .line'), function (line) {
        gsap.fromTo(line, CHARS_FROM, {
          yPercent: 0, y: 0, duration: 1.1, ease: EASE,
          scrollTrigger: { trigger: line.closest('.line-mask'), start: 'top 88%', once: true }
        });
      });

      /* —— 图片揭幕：遮罩自下而上 + 内图 scale 归位 —— */
      Array.prototype.forEach.call(document.querySelectorAll('.img-reveal'), function (fig) {
        var img = fig.querySelector('img');
        var st = { trigger: fig, start: 'top 85%', once: true };
        gsap.fromTo(fig, { clipPath: 'inset(0 0 100% 0)' }, {
          clipPath: 'inset(0 0 0% 0)', duration: 1.15, ease: 'power4.inOut', scrollTrigger: st
        });
        if (img) {
          gsap.fromTo(img, { scale: 1.18 }, {
            scale: 1, duration: 1.6, ease: 'power3.out',
            scrollTrigger: { trigger: fig, start: 'top 85%', once: true }
          });
        }
      });

      /* —— 轻微视差：仅桌面（移动端关闭，约束 Q8） —— */
      if (desk) {
        Array.prototype.forEach.call(document.querySelectorAll('[data-parallax]'), function (img) {
          gsap.fromTo(img, { yPercent: -5, scale: 1.12 }, {
            yPercent: 5, scale: 1.12, ease: 'none',
            scrollTrigger: { trigger: img.parentElement, start: 'top bottom', end: 'bottom top', scrub: true }
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
       响应式调度：桌面全量 / 移动端轻量（gsap.matchMedia 显式处理，
       减少动态场景在入口处已排除，不会走到这里）
       ================================================================ */
    var mm = gsap.matchMedia();
    mm.add({
      desk: '(min-width: 48em) and (prefers-reduced-motion: no-preference)',
      mobile: '(max-width: 47.9937em) and (prefers-reduced-motion: no-preference)'
    }, function (ctx) {
      intro(ctx.conditions.desk);
      scrollFx(ctx.conditions.desk);
    });

  } catch (err) {
    bail();
  }
})();

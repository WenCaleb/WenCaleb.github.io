/*
 * WenCaleb 全站光标增强（增强型）—— 系统光标保留，另跟手一个小圆点；
 * 带 [data-magnet] 的元素加磁吸：靠近时朝光标偏移，离开时弹回。
 *
 * 只在精确指针（鼠标）上启用；触屏设备与 prefers-reduced-motion 用户直接跳过
 * （圆点 DOM 保留，CSS 里 .cur-dot 默认 opacity 0，只有 html.fine 才显示）。
 *
 * 磁吸与圆点优先走 GSAP（elastic 回弹手感、统一 gsap.ticker 调度）；
 * GSAP 缺失时静默退回原生 rAF + 直接写 transform，功能不变。
 */
(function () {
  'use strict';
  if (window.matchMedia('(pointer: coarse)').matches) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var dot = document.querySelector('.cur-dot');
  if (!dot) return;
  document.documentElement.classList.add('fine');
  var hasGsap = !!(window.gsap && window.gsap.to);

  /* —— 跟手圆点：lerp 缓动，不瞬移 —— */
  var tx = window.innerWidth / 2, ty = window.innerHeight / 2;
  var x = tx, y = ty;
  window.addEventListener('pointermove', function (e) {
    tx = e.clientX; ty = e.clientY;
  }, { passive: true });
  function moveDot() {
    x += (tx - x) * 0.22;
    y += (ty - y) * 0.22;
    dot.style.transform = 'translate(' + (x - 5) + 'px,' + (y - 5) + 'px)';
  }
  if (hasGsap) {
    /* 统一挂在 gsap.ticker 上，全站少一条独立的 rAF 动画源 */
    window.gsap.ticker.add(moveDot);
  } else {
    (function loop() {
      moveDot();
      requestAnimationFrame(loop);
    })();
  }

  /* —— 可交互元素上：圆点放大成环（mouseover 幂等，子元素边界抖动无碍） —— */
  document.addEventListener('mouseover', function (e) {
    var t = e.target;
    var hit = t.closest && t.closest('a, button, input');
    dot.classList.toggle('is-hover', !!hit);
  });

  /* —— 磁吸：按钮朝光标方向偏移 ~30%，离开时弹性回弹 ——
     GSAP 版：elastic 回弹（gsap.com 式手感）。关键点：stylesheet 里
     .hero-action 自带 transform 的 CSS transition，会与 GSAP 逐帧写的
     transform 打架（产生拖尾），所以进入时先 inline 压掉 transform
     transition，回弹结束后再还原 */
  var MAGNET = 0.3;
  document.querySelectorAll('[data-magnet]').forEach(function (btn) {
    var off = true;
    var styleTrans = btn.style.transition;
    if (hasGsap) {
      btn.addEventListener('mouseenter', function () {
        window.gsap.killTweensOf(btn);
        window.gsap.set(btn, { x: 0, y: 0 });
        btn.style.transition = 'background-color 0.18s ease'; /* 压掉 transform 过渡，防止拖尾 */
        off = false;
      });
      btn.addEventListener('mousemove', function (e) {
        if (off) return;
        var r = btn.getBoundingClientRect();
        var dx = (e.clientX - (r.left + r.width / 2)) * MAGNET;
        var dy = (e.clientY - (r.top + r.height / 2)) * MAGNET;
        window.gsap.to(btn, { x: dx, y: dy, duration: 0.35, ease: 'power2.out', overwrite: 'auto' });
      });
      btn.addEventListener('mouseleave', function () {
        off = true;
        window.gsap.to(btn, {
          x: 0, y: 0, duration: 0.55, ease: 'elastic.out(1, 0.35)',
          onComplete: function () { btn.style.transition = styleTrans; }
        });
      });
    } else {
      /* 无 GSAP 降级：原生 transition，不碰 transform 之外的属性 */
      btn.addEventListener('mousemove', function (e) {
        var r = btn.getBoundingClientRect();
        var dx = (e.clientX - (r.left + r.width / 2)) * MAGNET;
        var dy = (e.clientY - (r.top + r.height / 2)) * MAGNET;
        btn.style.transition = 'transform 0.12s ease-out';
        btn.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
      });
      btn.addEventListener('mouseleave', function () {
        requestAnimationFrame(function () {
          btn.style.transition = 'transform 0.3s ease-out';
          btn.style.transform = '';
        });
      });
    }
  });
})();

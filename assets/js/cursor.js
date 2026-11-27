/*
 * WenCaleb 全站光标增强（增强型）—— 系统光标保留，另跟手一个小圆点；
 * 带 [data-magnet] 的元素加磁吸：靠近时朝光标偏移，离开时弹回。
 *
 * 只在精确指针（鼠标）上启用；触屏设备与 prefers-reduced-motion 用户直接跳过
 * （圆点 DOM 保留，CSS 里 .cur-dot 默认 opacity 0，只有 html.fine 才显示）。
 */
(function () {
  'use strict';
  if (window.matchMedia('(pointer: coarse)').matches) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var dot = document.querySelector('.cur-dot');
  if (!dot) return;
  document.documentElement.classList.add('fine');

  /* —— 跟手圆点：lerp 缓动，不瞬移 —— */
  var tx = window.innerWidth / 2, ty = window.innerHeight / 2;
  var x = tx, y = ty;
  window.addEventListener('pointermove', function (e) {
    tx = e.clientX; ty = e.clientY;
  }, { passive: true });
  (function loop() {
    x += (tx - x) * 0.22;
    y += (ty - y) * 0.22;
    dot.style.transform = 'translate(' + (x - 5) + 'px,' + (y - 5) + 'px)';
    requestAnimationFrame(loop);
  })();

  /* —— 可交互元素上：圆点放大成环（mouseover 幂等，子元素边界抖动无碍） —— */
  document.addEventListener('mouseover', function (e) {
    var t = e.target;
    var hit = t.closest && t.closest('a, button, input');
    dot.classList.toggle('is-hover', !!hit);
  });

  /* —— 磁吸：按钮朝光标方向偏移 ~30%，离开弹回 —— */
  var MAGNET = 0.3;
  document.querySelectorAll('[data-magnet]').forEach(function (btn) {
    btn.addEventListener('mousemove', function (e) {
      var r = btn.getBoundingClientRect();
      var dx = (e.clientX - (r.left + r.width / 2)) * MAGNET;
      var dy = (e.clientY - (r.top + r.height / 2)) * MAGNET;
      btn.style.transition = 'transform 0.12s ease-out, background-color 0.18s ease';
      btn.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
    });
    btn.addEventListener('mouseleave', function () {
      requestAnimationFrame(function () {
        btn.style.transition = '';
        btn.style.transform = '';
      });
    });
  });
})();

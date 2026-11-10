import test from 'node:test';
import assert from 'node:assert/strict';

test('пул эффектов ограничен и освобождается, shake и flash затухают', async () => {
  const { createFX } = await import('./fx.js');
  const fx = createFX(false);
  for (let i=0; i<100; i++) fx.burst(100,100,15);
  assert.equal(fx.count(),200);
  fx.shake(10); fx.flash(1,true);
  for (let i=0; i<100; i++) fx.update(30);
  assert.equal(fx.count(),0);
  assert.ok(Math.abs(fx.offset().x) < .01);
});

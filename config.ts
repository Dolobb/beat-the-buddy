export const friends = [
  { id: 'f1', name: 'Пешка', color: '#e74c3c' },
  { id: 'f2', name: 'Бло', color: '#3498db',
    phrases: ['Да я верну, клянусь!', 'Бля, скоро верну, Дрон', 'Завтра точно отдам', 'С зарплаты верну',
      'Ну подожди до пятницы', 'Я же сказал, верну!', 'Дай ещё неделю', 'Карта не работает, бля',
      'Да там копейки вообще', 'Не бей, я ищу деньги!'],
  },
  { id: 'f3', name: 'Боб', color: '#27ae60' },
  { id: 'f4', name: 'Джстл', color: '#9b59b6' },
  { id: 'f5', name: 'Мар', color: '#e67e22' },
  { id: 'f6', name: 'Дрон', color: '#16a085' },
];

// mode: 0 — удар в точке тапа, 1 — снаряд; auto: интервал удержания в мс или 0.
export const weapons = [
  { name: 'Кулак',    icon: '👊', price: 0,     dmg: 1,  radius: 50,  force: 8,  mode: 0, auto: 0 },
  { name: 'Тапок',    icon: '🩴', price: 50,    dmg: 2,  radius: 50,  force: 12, mode: 1, auto: 0 },
  { name: 'Бита',     icon: '🏏', price: 300,   dmg: 5,  radius: 110, force: 20, mode: 0, auto: 0 },
  { name: 'Пистолет', icon: '🔫', price: 700,   dmg: 4,  radius: 40,  force: 14, mode: 0, auto: 300 },
  { name: 'Пулемёт',  icon: '💥', price: 2000,  dmg: 2,  radius: 45,  force: 8,  mode: 0, auto: 110 },
  { name: 'Граната',  icon: '💣', price: 5000,  dmg: 15, radius: 130, force: 35, mode: 1, auto: 0 },
  { name: 'Базука',   icon: '🚀', price: 15000, dmg: 30, radius: 150, force: 50, mode: 1, auto: 0 },
  { name: 'Лазер',    icon: '⚡', price: 40000, dmg: 4,  radius: 35,  force: 6,  mode: 0, auto: 60 },
];

export const phrases = ['Ай!', 'За что?!', 'Хватит!', 'Мама!'];
export const HP = 100, KO_BONUS = 20;

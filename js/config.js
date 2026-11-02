// Общие игровые данные. Отсюда же генерится SQL (tools/gen_sql.mjs) — единый источник правды.

export const GOODS={
  wheat:{n:'Пшеница',ic:'🌾',base:5,target:400,col:0xe8c547},
  veg:{n:'Овощи',ic:'🥕',base:6,target:300,col:0xe67e22},
  milk:{n:'Молоко',ic:'🥛',base:7,target:250,col:0xf5f5f5},
  wood:{n:'Брёвна',ic:'🪵',base:6,target:300,col:0x8b5a2b},
  stone:{n:'Камень',ic:'🪨',base:8,target:300,col:0x9a9a9a},
  fish:{n:'Рыба',ic:'🐟',base:7,target:300,col:0x7fb3d5},
  flour:{n:'Мука',ic:'🥡',base:15,target:150,col:0xf2efe6},
  bread:{n:'Хлеб',ic:'🍞',base:11,target:200,col:0xc9822b},
  cheese:{n:'Сыр',ic:'🧀',base:28,target:100,col:0xf4d03f},
  planks:{n:'Доски',ic:'🟫',base:20,target:150,col:0xd9a066},
  bricks:{n:'Кирпич',ic:'🧱',base:24,target:150,col:0xb5533c},
  smoked:{n:'Копчёная рыба',ic:'🍢',base:22,target:120,col:0xa0622d},
  furniture:{n:'Мебель',ic:'🪑',base:80,target:40,col:0x7a4a2a},
  honey:{n:'Мёд',ic:'🍯',base:18,target:150,col:0xf0a500},
  eggs:{n:'Яйца',ic:'🥚',base:6,target:300,col:0xfaf3e0},
  apples:{n:'Яблоки',ic:'🍎',base:5,target:300,col:0xd63031},
  wool:{n:'Шерсть',ic:'🧶',base:9,target:200,col:0xe8e2d4},
  juice:{n:'Сок',ic:'🧃',base:14,target:150,col:0xf39c12},
  cake:{n:'Торт',ic:'🎂',base:90,target:40,col:0xff8fab},
  clothes:{n:'Одежда',ic:'👕',base:60,target:60,col:0x3d6ea6},
};
export const GK=Object.keys(GOODS);

// Районы: c — город (земля), v — деревня, d — дачи, p — промзона, o — порт, B — офис в бизнес-центре
export const REGN={c:'город',v:'деревня',d:'дачи',p:'промзона',o:'порт',B:'бизнес-центр'};

// rate — циклов в минуту на одного работника; wage — 💰 в минуту на работника;
// service: rate — клиентов в минуту на работника (ограничено спросом района), pay — 💰 за клиента
export const BLD={
  farm:{n:'Ферма',ic:'🌾',w:'Фермер',reg:'vd',kind:'gather',out:{wheat:1},rate:8,wage:3,cost:90,mat:{},ord:0,hat:0xe9d8a6,desc:'Пшеница. Самый дешёвый старт.'},
  garden:{n:'Огород',ic:'🥕',w:'Огородник',reg:'vd',kind:'gather',out:{veg:1},rate:6,wage:3,cost:110,mat:{},ord:0,hat:0x6ab04c,desc:'Овощи для шаурмы, столовых и ресторанов.'},
  cowshed:{n:'Коровник',ic:'🐄',w:'Скотник',reg:'vd',kind:'gather',out:{milk:1},rate:4,wage:4,cost:220,mat:{planks:4},ord:0,hat:0xffffff,desc:'Молоко → сыр и кофейни.'},
  lumber:{n:'Делянка',ic:'🪓',w:'Лесоруб',reg:'vd',kind:'gather',res:'tree',out:{wood:1},rate:6,wage:3,cost:100,mat:{},ord:0,hat:0xb22222,desc:'Лесоруб рубит лес → брёвна.'},
  quarry:{n:'Карьер',ic:'⛏️',w:'Каменотёс',reg:'vdp',kind:'gather',res:'rock',out:{stone:1},rate:5,wage:4,cost:160,mat:{},ord:0,hat:0xf2c14e,desc:'Камень из гор на севере.'},
  fishery:{n:'Рыбацкая будка',ic:'🎣',w:'Рыбак',reg:'vdo',kind:'gather',res:'water',out:{fish:1},rate:4,wage:3,cost:110,mat:{},ord:0,hat:0x2e86ab,desc:'Рыбалка на реке, озере или море.'},
  trawler:{n:'Рыболовное судно',ic:'🚢',w:'Матрос',reg:'o',kind:'gather',res:'boat',out:{fish:1},rate:12,wage:8,cost:900,mat:{planks:10},ord:0,hat:0x1b3a5c,desc:'Своё судно в порту: выходит в море за уловом.'},
  apiary:{n:'Пасека',ic:'🐝',w:'Пасечник',reg:'vd',kind:'gather',out:{honey:1},rate:2,wage:3,cost:180,mat:{planks:3},ord:0,hat:0xf1c40f,desc:'Мёд — для кондитерских и магазинов.'},
  henhouse:{n:'Птичник',ic:'🐔',w:'Птичница',reg:'vd',kind:'gather',out:{eggs:1},rate:6,wage:3,cost:140,mat:{planks:2},ord:0,hat:0xffffff,desc:'Яйца — для кондитерских.'},
  orchard:{n:'Сад',ic:'🍎',w:'Садовник',reg:'vd',kind:'gather',out:{apples:1},rate:7,wage:3,cost:130,mat:{},ord:0,hat:0x6ab04c,desc:'Яблоки → соковый цех.'},
  sheepfold:{n:'Овчарня',ic:'🐑',w:'Чабан',reg:'vd',kind:'gather',out:{wool:1},rate:3,wage:4,cost:200,mat:{planks:4},ord:0,hat:0x8b5a2b,desc:'Шерсть → швейный цех.'},
  mill:{n:'Мельница',ic:'🌀',w:'Мельник',reg:'vd',kind:'proc',in:{wheat:2},out:{flour:1},rate:4,wage:4,cost:250,mat:{stone:6},ord:1,hat:0xffffff,desc:'2 пшеницы → 1 мука.'},
  sawmill:{n:'Пилорама',ic:'🪚',w:'Пильщик',reg:'vdp',kind:'proc',in:{wood:2},out:{planks:1},rate:4,wage:4,cost:250,mat:{stone:6},ord:1,hat:0x6b4226,desc:'2 бревна → 1 доска.'},
  brickworks:{n:'Кирпичный завод',ic:'🧱',w:'Формовщик',reg:'p',kind:'proc',in:{stone:2},out:{bricks:1},rate:4,wage:5,cost:400,mat:{planks:6},ord:1,hat:0xf2c14e,desc:'2 камня → 1 кирпич.'},
  smokehouse:{n:'Коптильня',ic:'🔥',w:'Коптильщик',reg:'vdpo',kind:'proc',in:{fish:2},out:{smoked:1},rate:3,wage:4,cost:220,mat:{planks:4},ord:1,hat:0x444444,desc:'2 рыбы → 1 копчёная.'},
  dairy:{n:'Сыроварня',ic:'🧀',w:'Сыровар',reg:'vdp',kind:'proc',in:{milk:3},out:{cheese:1},rate:3,wage:5,cost:400,mat:{bricks:4},ord:1,hat:0xffffff,desc:'3 молока → 1 сыр.'},
  juicery:{n:'Соковый цех',ic:'🧃',w:'Технолог',reg:'vdp',kind:'proc',in:{apples:3},out:{juice:2},rate:3,wage:4,cost:300,mat:{bricks:3},ord:1,hat:0xf39c12,desc:'3 яблока → 2 сока.'},
  confectionery:{n:'Кондитерская',ic:'🎂',w:'Кондитер',reg:'cp',kind:'proc',in:{flour:1,eggs:2,honey:1},out:{cake:1},rate:2,wage:7,cost:600,mat:{bricks:6},ord:2,hat:0xffffff,desc:'Мука + 2 яйца + мёд → торт. Дорогой товар.'},
  tailor:{n:'Швейный цех',ic:'🧵',w:'Швея',reg:'cp',kind:'proc',in:{wool:3},out:{clothes:1},rate:2,wage:6,cost:550,mat:{bricks:5},ord:2,hat:0x8e44ad,desc:'3 шерсти → 1 одежда.'},
  store:{n:'Магазин',ic:'🏪',w:'Продавец',reg:'cvd',kind:'retail',in:{},rate:6,wage:5,cost:400,mat:{planks:4},ord:3,hat:0x2e86ab,desc:'Продаёт жителям твой товар со склада в розницу (×1.6 к базовой цене): торты, одежду, сыр, сок, хлеб, мёд…'},
  bakery:{n:'Пекарня',ic:'🥖',w:'Пекарь',reg:'cp',kind:'proc',in:{flour:1},out:{bread:2},rate:4,wage:5,cost:350,mat:{bricks:4},ord:2,hat:0xffffff,desc:'1 мука → 2 хлеба.'},
  workshop:{n:'Мебельный цех',ic:'🔨',w:'Столяр',reg:'cp',kind:'proc',in:{planks:3},out:{furniture:1},rate:2,wage:7,cost:500,mat:{planks:6,bricks:6},ord:2,hat:0x355070,desc:'3 доски → 1 мебель. Мебель нужна всем для квартир.'},
  pvz:{n:'ПВЗ',ic:'📦',w:'Сотрудник ПВЗ',reg:'c',kind:'service',in:{},pay:12,rate:6,wage:5,cost:650,mat:{bricks:5},ord:3,hat:0xff8c1a,desc:'Выдаёт посылки жителям: +12💰 за клиента.'},
  shawarma:{n:'Шаурмичная',ic:'🌯',w:'Шаурмист',reg:'c',kind:'service',in:{bread:1,veg:1},pay:30,rate:5,wage:5,cost:500,mat:{bricks:3},ord:3,hat:0xc0392b,desc:'Хлеб + овощи → +30💰 за клиента.'},
  fishstall:{n:'Ларёк «Рыба»',ic:'🐠',w:'Продавец',reg:'c',kind:'service',in:{smoked:1},pay:34,rate:5,wage:4,cost:420,mat:{planks:4},ord:3,hat:0x2e86ab,desc:'Копчёная рыба → +34💰 за клиента.'},
  canteen:{n:'Столовая',ic:'🍲',w:'Повар',reg:'cB',kind:'service',in:{veg:1,bread:1,fish:1},pay:48,rate:6,wage:6,cost:1100,mat:{bricks:6},ord:3,hat:0xffffff,desc:'Овощи + хлеб + рыба → +48💰 за клиента.'},
  cafe:{n:'Кофейня',ic:'☕',w:'Бариста',reg:'B',kind:'service',in:{milk:1,bread:1},pay:34,rate:6,wage:6,cost:900,mat:{furniture:2},ord:3,hat:0x6f4e37,desc:'Для офисного планктона: молоко + хлеб → +34💰.'},
  restaurant:{n:'Ресторан',ic:'🍽️',w:'Шеф',reg:'B',kind:'service',in:{cheese:1,smoked:1,veg:1},pay:120,rate:4,wage:10,cost:3000,mat:{furniture:4},ord:3,hat:0xffffff,desc:'Сыр + копчёная рыба + овощи → +120💰. Топ-бизнес.'},
};
export const HIRE_FEE=40, MAX_WORKERS=3, SHIFT_SEC=20, BUILD_SEC=20, START_MONEY=150, OWNER_JOB_PAY=7;

// Городские работодатели (NPC-фирмы). out — что фирма сама производит в склад базы в минуту.
export const EMP={
  kolkhoz:{n:'Колхоз «Рассвет»',job:'разнорабочий',pay:4,req:0,out:{wheat:14,veg:8,milk:6}},
  lesxoz:{n:'Леспромхоз',job:'вальщик',pay:6,req:5,out:{wood:12,planks:3}},
  market:{n:'Оптовая база',job:'грузчик',pay:5,req:0,out:{}},
  pvzCity:{n:'ПВЗ «Коробас»',job:'выдаёт посылки',pay:6,req:0,out:{}},
  sortCenter:{n:'Сортировка «Коробас»',job:'сортировщик',pay:6,req:0,out:{}},
  zbi:{n:'Завод ЖБИ',job:'формовщик',pay:8,req:10,out:{stone:8,bricks:4}},
  furnFactory:{n:'Мебельная фабрика «Уют»',job:'сборщик',pay:9,req:20,out:{furniture:1.5}},
  port:{n:'Морской порт',job:'докер',pay:8,req:10,out:{fish:16,smoked:2}},
  bc:{n:'Бизнес-центр',job:'офисный клерк',pay:12,req:30,out:{}},
  shop:{n:'Магазин у дома',job:'кассир',pay:5,req:0,out:{}},
  cityhall:{n:'Мэрия',job:'чиновник',pay:10,req:50,out:{}},
};
// Карьерная лестница — по числу отработанных смен
export const CAREER=[[0,'Стажёр'],[10,'Работник'],[30,'Специалист'],[100,'Менеджер'],[300,'Директор']];
export const careerOf=s=>{let r=CAREER[0][1];for(const[k,n]of CAREER)if(s>=k)r=n;return r;};

// Жильё
export const RES={
  khrush:{n:'Хрущёвка',floors:5,units:4,price:500,step:25,room:[4,4]},
  panel9:{n:'Панелька 9 эт.',floors:9,units:5,price:900,step:40,room:[5,5]},
  panel16:{n:'Панелька 16 эт.',floors:16,units:5,price:1600,step:60,room:[6,5]},
  novostroy:{n:'Новостройка',floors:25,units:5,price:3500,step:120,room:[7,6]},
  tower:{n:'Небоскрёб',floors:30,units:4,price:9000,step:400,room:[9,7]},
};
export const BCT={n:'Бизнес-центр',floors:20,units:5,price:1800,step:80};
export const DORM_ROOM=[3,3];

// Мебель для квартир — только из того, что делают игроки
export const FURN={
  bed:{n:'Кровать',ic:'🛏️',cost:{furniture:3},money:20,w:2,d:1},
  sofa:{n:'Диван',ic:'🛋️',cost:{furniture:3},money:20,w:2,d:1},
  table:{n:'Стол',ic:'🟫',cost:{furniture:2},money:10,w:1,d:1},
  chair:{n:'Стул',ic:'🪑',cost:{furniture:1},money:5,w:1,d:1},
  wardrobe:{n:'Шкаф',ic:'🚪',cost:{furniture:2},money:10,w:1,d:1},
  shelf:{n:'Полка с книгами',ic:'📚',cost:{furniture:1,planks:1},money:10,w:1,d:1},
  lamp:{n:'Торшер',ic:'💡',cost:{furniture:1},money:15,w:1,d:1},
  plant:{n:'Фикус',ic:'🪴',cost:{veg:3},money:15,w:1,d:1},
  aquarium:{n:'Аквариум',ic:'🐠',cost:{fish:3,planks:2},money:40,w:1,d:1},
  rug:{n:'Плетёный коврик',ic:'🟨',cost:{wheat:8},money:10,w:2,d:2,floor:true},
};

// ===== Уровни: функции открываются постепенно =====
export const lvlOf=xp=>Math.floor(Math.sqrt(Math.max(0,xp)/50))+1;
export const xpFor=l=>50*(l-1)**2;
export const NEED={land:2,gather:2,furn:2,hire:3,buyMarket:3,proc:4,apt:4,service:5,playerJob:5,vote:6,office:7,run:8};
export const UNLOCKS={1:'Работа и продажа на базе',2:'Своя земля, ферма/сад/пасека/делянка, мебель, биржа игроков',3:'Найм работников, закупки на базе, свой магазин',4:'Переработка (мельница, пилорама…), покупка квартир',
  5:'Точки в городе (ПВЗ, шаурма), работа у других игроков',6:'Голосование на выборах',7:'Офисы в бизнес-центрах',8:'Можно баллотироваться в мэры и начальники'};
export const needFor=b=>b.reg==='B'?NEED.office:b.kind==='service'?NEED.service:b.kind==='proc'?NEED.proc:b.kind==='retail'?3:NEED.gather;

// ===== Ежедневная награда и скины (кристаллы 💎) =====
export const DAILY=[5,5,10,10,15,20,40];
export const SKINS={cap:{n:'Кепка',price:10,col:0xc0392b},ushanka:{n:'Ушанка',price:20,col:0x6b4a2f},helmet:{n:'Каска',price:25,col:0xf1c40f},
  cowboy:{n:'Ковбойская шляпа',price:40,col:0x8b5a2b},tophat:{n:'Цилиндр',price:60,col:0x222222},crown:{n:'Корона',price:150,col:0xffd700}};

// ===== Мэрия =====
export const POSITIONS={mayor:{n:'Мэр',ic:'🎩',power:'Ставит налоги (с продаж 0–15%, на имущество 0–30💰/день) и зарплаты начальникам. Зарплата 300💰/день из казны.'},
  tax:{n:'Глава налоговой',ic:'🧾',power:'Включает/выключает льготу: новички до 4 уровня не платят налог на имущество.'},
  housing:{n:'Глава ЖКХ',ic:'🔧',power:'Субботник за 500💰 из казны: спрос на все услуги города +30% на 6 часов.'},
  trade:{n:'Глава торговли',ic:'⚖️',power:'Ставит сбор с закупок на оптовой базе (0–10%) в пользу казны.'}};

// ===== Локальные задания в живописных местах =====
export const QUESTS={
  cat:{poi:'cat',n:'Найти кота бабы Зины',act:'ищет кота',dur:10,money:30,xp:15,cd:90,lvl:1},
  spring:{poi:'spring',n:'Набрать родниковой воды',act:'набирает воду',dur:8,money:15,xp:10,cd:30,lvl:1},
  mush:{poi:'mush',n:'Собрать грибы',act:'собирает грибы',dur:12,money:25,xp:15,cd:60,lvl:1},
  pier:{poi:'pier',n:'Порыбачить на мостках',act:'рыбачит',dur:15,good:'fish',qty:3,xp:10,cd:45,lvl:1},
  forester:{poi:'forester',n:'Наколоть дров деду Михалычу',act:'колет дрова',dur:15,money:40,xp:20,cd:120,lvl:1},
  harvest:{poi:'harvest',n:'Помочь колхозу с уборкой',act:'убирает урожай',dur:12,good:'wheat',qty:6,xp:15,cd:60,lvl:1},
  lookout:{poi:'lookout',n:'Подняться на смотровую вышку',act:'любуется видом',dur:10,gems:3,xp:40,cd:1440,lvl:1},
  camp:{poi:'camp',n:'Найти старый вымпел в лагере',act:'ищет вымпел',dur:10,gems:5,xp:30,cd:1440,lvl:2},
  fire:{poi:'fire',n:'Посидеть у костра с туристами',act:'греется у костра',dur:15,gems:2,xp:30,cd:240,lvl:2},
  lighthouse:{poi:'lighthouse',n:'Помочь смотрителю маяка',act:'чинит фонарь',dur:15,money:60,xp:25,cd:180,lvl:3},
};

// ===== Внешность персонажа =====
export const LOOK={
  skin:['#ffdbb4','#f1c27d','#e0ac69','#c68642','#a0662f','#6b3f1f'],
  height:[['s','Невысокий'],['m','Средний'],['t','Высокий']],
  build:[['slim','Худой'],['m','Обычный'],['strong','Крепкий']],
  eyes:['#3b2a1a','#2e86ab','#3a7d44','#6b6b6b','#7a4a24'],
  brows:[['thin','Тонкие'],['m','Обычные'],['thick','Густые']],
  mouth:[['smile','Улыбка'],['calm','Спокойный'],['smirk','Ухмылка']],
  beard:[['none','Нет'],['stubble','Щетина'],['mustache','Усы'],['beard','Борода']],
  glasses:[['none','Нет'],['round','Круглые'],['square','Квадратные'],['sun','Тёмные']],
  hairM:[['short','Короткая'],['buzz','Ёжик'],['side','Пробор'],['curly','Кудри'],['mohawk','Ирокез'],['longm','Длинные'],['bald','Лысый']],
  hairF:[['long','Длинные'],['bob','Каре'],['tail','Хвост'],['buns','Пучки'],['braids','Косички'],['curlyf','Кудри'],['pixie','Пикси']],
  hairCol:['#1a1410','#3b2a1a','#5a3a22','#8b5a2b','#a0522d','#e6c27a','#d9d9d9','#c0392b','#3d6ea6','#ff8fab'],
  topKind:[['tee','Футболка'],['hoodie','Худи'],['shirt','Рубашка'],['jacket','Куртка'],['track','Спортивка'],['sweater','Свитер']],
  top:['#3d6ea6','#c0392b','#2e7d32','#f1c40f','#8e44ad','#ecf0f1','#222222','#ff8c1a','#1e3a5f','#7f8c8d','#e67e22','#ff8fab'],
  accent:['#ffffff','#222222','#f1c40f','#c0392b','#3d6ea6','#2e7d32','#ff8c1a','#8e44ad'],
  bottomKindM:[['pants','Брюки'],['jeans','Джинсы'],['track','Спортивные'],['shorts','Шорты']],
  bottomKindF:[['pants','Брюки'],['jeans','Джинсы'],['track','Спортивные'],['shorts','Шорты'],['skirt','Юбка']],
  bottom:['#2c3e50','#34495e','#1e3a5f','#3d5a80','#5d4037','#222222','#7f8c8d','#c8b89a','#2e7d32','#8e3b46'],
  shoeKind:[['sneakers','Кеды'],['runners','Кроссовки'],['boots','Ботинки']],
  shoes:['#ffffff','#222222','#c0392b','#3d6ea6','#8b5a2b','#f1c40f','#7f8c8d','#2e7d32'],
  acc:[['none','Нет'],['chain','Цепочка'],['backpack','Рюкзак'],['bag','Сумка']],
};
export const DEFAULT_LOOK={g:'m',skin:1,height:'m',build:'m',eyes:'#3b2a1a',brows:'m',mouth:'smile',beard:'none',glasses:'none',
  hair:'short',hc:'#3b2a1a',tk:'tee',top:'#3d6ea6',top2:'#ffffff',bk:'jeans',bottom:'#3d5a80',sk:'sneakers',shoes:'#ffffff',acc:'none'};

// ===== Рабочая экипировка: бонусы к производству. Получить трудно: сложные задания или дорого =====
export const GEAR={
  gloves:{n:'Рабочие перчатки',ic:'🧤',slot:'hands',eff:'+10% ко всем твоим бизнесам',money:3000},
  apron:{n:'Фартук мастера',ic:'🥼',slot:'body',eff:'+25% к переработке',gems:150},
  vest:{n:'Жилет лесника',ic:'🦺',slot:'body',eff:'+20% к добыче (лес, камень, рыба…)',req:{quest:'forester',count:10}},
  boots:{n:'Сапоги рыбака',ic:'🥾',slot:'feet',eff:'+30% к рыбалке',req:{quest:'pier',count:15}},
  belt:{n:'Пояс фермера',ic:'🎗',slot:'acc',eff:'+25% к фермам, садам, пасекам',req:{quest:'harvest',count:10}},
  jacket:{n:'Пиджак директора',ic:'🧥',slot:'body',eff:'+20% к услугам и магазинам',req:{shifts:200}},
  watch:{n:'Золотые часы',ic:'⌚',slot:'acc',eff:'+50% к оплате смен',money:15000},
  lighthouse_cap:{n:'Фуражка смотрителя',ic:'⚓',slot:'feet',eff:'+15% ко всем бизнесам',req:{quest:'lighthouse',count:20}},
};
export const SLOTS={hands:'Руки',body:'Тело',feet:'Ноги',acc:'Аксессуар'};
export const OFFLINE_RATE=0.25;

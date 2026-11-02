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
  mill:{n:'Мельница',ic:'🌀',w:'Мельник',reg:'vd',kind:'proc',in:{wheat:2},out:{flour:1},rate:4,wage:4,cost:250,mat:{stone:6},ord:1,hat:0xffffff,desc:'2 пшеницы → 1 мука.'},
  sawmill:{n:'Пилорама',ic:'🪚',w:'Пильщик',reg:'vdp',kind:'proc',in:{wood:2},out:{planks:1},rate:4,wage:4,cost:250,mat:{stone:6},ord:1,hat:0x6b4226,desc:'2 бревна → 1 доска.'},
  brickworks:{n:'Кирпичный завод',ic:'🧱',w:'Формовщик',reg:'p',kind:'proc',in:{stone:2},out:{bricks:1},rate:4,wage:5,cost:400,mat:{planks:6},ord:1,hat:0xf2c14e,desc:'2 камня → 1 кирпич.'},
  smokehouse:{n:'Коптильня',ic:'🔥',w:'Коптильщик',reg:'vdpo',kind:'proc',in:{fish:2},out:{smoked:1},rate:3,wage:4,cost:220,mat:{planks:4},ord:1,hat:0x444444,desc:'2 рыбы → 1 копчёная.'},
  dairy:{n:'Сыроварня',ic:'🧀',w:'Сыровар',reg:'vdp',kind:'proc',in:{milk:3},out:{cheese:1},rate:3,wage:5,cost:400,mat:{bricks:4},ord:1,hat:0xffffff,desc:'3 молока → 1 сыр.'},
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
  tower:{n:'Небоскрёб',floors:42,units:4,price:9000,step:400,room:[9,7]},
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

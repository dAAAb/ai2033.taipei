// Copy for cards, missions and labels. Facts follow the Taipei City Government press release of 2026-10-08
// ("輝達來了！蔣萬安發表「AI黃金世紀」新願景 拋松機遷移打造百公頃臺北AI園區").
export const PHOTO = {
  portrait: '../assets/photos/chiang-portrait-crop.jpg',
  speech: '../assets/photos/chiang-speech.jpg',
  podium: '../assets/photos/chiang-council.jpg',
  stage: '../assets/photos/chiang-stage.jpg',
  map: '../assets/photos/chiang-map.jpg',
  lee: '../assets/photos/lee-shih-chuan.jpg',
};
// author and licence shown with each photo (assets/photos/credits.json; the CC BY-SA licence asks for a link)
export const PHOTO_CREDIT = {
  portrait: '照片：<a href="https://commons.wikimedia.org/wiki/File:%E8%94%A3%E8%90%AC%E5%AE%89%E5%B8%82%E9%95%B7_(cropped).jpg" target="_blank" rel="noopener">臺北市政府</a>，姓名標示，Wikimedia Commons（已裁切）',
  speech: '照片：<a href="https://commons.wikimedia.org/wiki/File:%E8%94%A3%E8%90%AC%E5%AE%89%E5%B8%82%E5%BA%9C%E5%9C%98%E9%9A%8A%E6%AD%A3%E5%BC%8F%E6%8E%A5%E6%A3%92%E4%B8%8A%E4%BB%BB_01.jpg" target="_blank" rel="noopener">臺北市政府</a>，姓名標示，Wikimedia Commons（已裁切）',
  podium: '照片：<a href="https://commons.wikimedia.org/wiki/File:Chiang_Wan-an_20231108.jpg" target="_blank" rel="noopener">臺北市政府</a>，姓名標示，Wikimedia Commons（已裁切）',
  stage: '照片：<a href="https://commons.wikimedia.org/wiki/File:Chiang_Wan-an_talking_on_the_main_stage_20221217a.jpg" target="_blank" rel="noopener">Solomon203</a>，<a href="https://creativecommons.org/licenses/by-sa/4.0/deed.zh-hant" target="_blank" rel="noopener">CC BY-SA 4.0</a>，Wikimedia Commons（已裁切）',
  map: '照片：<a href="https://commons.wikimedia.org/wiki/File:%E8%94%A3%E5%B8%82%E9%95%B7%E6%8E%A5%E8%A6%8B%E6%BE%B3%E6%B4%B2%E8%BE%A6%E4%BA%8B%E8%99%95%E6%96%B0%E4%BB%BB%E4%BB%A3%E8%A1%A8%E9%A6%AE%E5%9C%8B%E6%96%8C_02.jpg" target="_blank" rel="noopener">臺北市政府秘書處媒體事務組</a>，姓名標示，Wikimedia Commons（已裁切）',
  lee: '照片：<a href="https://commons.wikimedia.org/wiki/File:%E6%9D%8E%E5%9B%9B%E5%B7%9D%E5%89%AF%E5%B8%82%E9%95%B7.png" target="_blank" rel="noopener">高雄市政府</a>，姓名標示，Wikimedia Commons（已裁切）',
};
// campaign art hung on roadside T霸 and rooftop signs around the delivery course
export const SIGN = { src: '../assets/signs/antidrug.jpg', aspect: 494 / 1057 };

export const INTRO = {
  kicker: '2026.10.08 臺北市政府記者會',
  title: 'AI黃金世紀，從臺北開始',
  body: '臺北市長蔣萬安宣布：規劃<b>遷移松山機場</b>，整合機場及周邊 <b>300 公頃</b>，打造全新「臺北AI園區」。開著台北小黃，親眼看松山機場在 2033 年變身吧！',
  quote: '「我的第一個任期，成功爭取輝達進駐；我的第二個任期，要抓住AI這樣的歷史性機遇，為臺灣開創新的『AI黃金世紀』。」',
};

export const MISSIONS = [
  { id: 'm1', title: '任務 1：開往松山機場', hint: '沿著敦化北路一路往北，開到松山機場航廈前的金色光圈。' },
  { id: 'm2', title: '任務 2：探索 2033 臺北AI園區', hint: '依序通過金色光圈，認識松機變身後的每一塊拼圖。' },
  { id: 'free', title: '自由探索', hint: '隨意開車或切換空拍。按「2026 ⇄ 2033」看前後對比。' },
];

export const CHECKPOINTS = [
  {
    key: 'park', label: '110 公頃中央公園',
    title: '110 公頃臺北中央公園', big: '110 公頃',
    body: '松機<b>北半側</b>闢建 110 公頃中央公園，面積和倫敦海德公園差不多，約是東京代代木公園的 <b>2 倍</b>、大安森林公園的 <b>4 倍</b>，成為臺北都市生態的「綠色脊柱」。',
    photo: null,
  },
  {
    key: 'ai', label: '100 公頃 AI 產業聚落',
    title: '100 公頃 AI 產業聚落', big: '12 兆',
    body: '以松南營區、松機南側為基地，與中央一起打造臺北AI園區。產業局以內科每公頃 360 億元產值估算，預估可創造 <b>12 兆元產值</b>、<b>6.5 萬</b>個就業機會。',
    photo: 'speech',
  },
  {
    key: 'live', label: '90 公頃國際永續生活聚落',
    title: '90 公頃國際永續生活聚落', big: '3.5 萬人',
    body: '90 公頃住宅及支援性公共設施，可容納 <b>3.5 萬</b>居住人口。加上 6.5 萬就業人口，會形成<b>超過 10 萬人</b>的生活聚落。',
    photo: null,
  },
  {
    key: 'metro', label: 'XY 軸捷運・松機站',
    title: '臺北 XY 軸捷運', big: 'X + Y',
    body: '<b>Y 軸</b>（南北向）從松山機場往南串聯國父紀念館、大安、公館、中和；<b>X 軸</b>（東西向）串聯士林大同線、圓山、松山機場與內湖，連起北士科、AI園區、內科、南軟<b>四大園區</b>。',
    photo: null,
  },
  {
    key: 'river', label: '基隆河大直段河岸再造',
    title: '跨河廊道＋河岸再造', big: '打通',
    body: '新增基湖路、敬業三路、北安路<b>跨河廊道</b>穿越松機腹地，接松山、信義；民族東路向東串聯大直、內湖，紓解每天數十萬人的內科通勤。再結合<b>基隆河大直段河岸再造</b>。',
    photo: null,
  },
  {
    key: 'renewal', label: '570 公頃航高解禁都更',
    title: '570 公頃都更解鎖', big: '15 萬戶',
    body: '跑道前後的<b>航高限制</b>讓周邊許多 4、5 樓老公寓長年無法改建。松機遷移後，約 <b>570 公頃</b>都市更新地區有機會改建，加上園區開發，可增加約 <b>15 萬戶</b>居住單元。看看四周的房子長高了！',
    photo: 'stage',
  },
];

export const FINALE = {
  title: '任務完成！',
  sub: 'AI黃金世紀，就從臺北開始',
  body: '「輝達來了，AI世紀也來了，臺北要抓住這個關鍵時機，站上AI時代的最前線，讓世界看見臺北，更因為臺北看見臺灣。」',
  note: '以上為 2026/10/08 市府公布之構想。實際配置圖尚未公布，本遊戲之空間配置為依新聞稿文字繪製的示意，遷移仍待中央政府評估與協調。',
};

export const STATS = [
  { k: '產值', v: '12 兆' },
  { k: '就業', v: '6.5 萬' },
  { k: '綠地', v: '110 公頃' },
];

export const TOUR = [
  { t: 0, cap: '2026 年的松山機場：被住宅與基隆河包圍的 2.6 公里跑道' },
  { t: 7, cap: '如果松山機場遷移……' },
  { t: 13, cap: '2033：300 公頃「臺北AI園區」' },
  { t: 20, cap: '北半側：110 公頃中央公園，臺北的綠色脊柱' },
  { t: 28, cap: '南側：100 公頃 AI 產業聚落，預估 12 兆產值' },
  { t: 36, cap: '90 公頃國際永續生活聚落，3.5 萬人安居' },
  { t: 44, cap: '向北接北士科、向東接內科與南軟、向南接市中心' },
  { t: 52, cap: 'AI黃金世紀，從臺北開始' },
];

// 2033 外送王: a fixed five-order course through the AI park, timed. Points are world metres (x east, z south)
// and must match the course the leaderboard validates (tools/leaderboard/supabase.sql) — bump `id` if they move.
// c1 ran at the old top speed (209 km/h on the meter); c2 is the 1:6 toy-scale taxi (100 km/h on the meter).
export const RACE = {
  id: 'c2', title: '2033 外送王', sub: '5 單限時外送挑戰',
  start: [101, 691], radius: 30,
  stops: [
    { at: [1001, 551], icon: '', item: '鮮奶', to: '國際永續生活聚落', note: '新住民的早餐' },
    { at: [-129, 471], icon: '', item: '雞腿便當', to: 'AI 產業聚落', note: '工程師加班中' },
    { at: [91, -69], icon: '', item: '珍珠奶茶', to: '110 公頃中央公園', note: '野餐要全糖去冰' },
    { at: [61, -249], icon: '', item: '鳳梨酥', to: 'XY 軸捷運 松機站', note: '國際旅客的伴手禮' },
    { at: [231, -529], icon: '', item: '鹹酥雞', to: '基隆河岸', note: '河濱夜跑完的宵夜' },
  ],
};

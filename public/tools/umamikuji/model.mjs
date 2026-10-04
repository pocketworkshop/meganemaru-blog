// 最初に運勢、その運勢に対する条件付き演出を抽選する。演出で運勢を変更しない。
export const FORTUNES = [
  { id: 'daikichi', label: '大吉', weight: 15, ratings: [4, 5], tickets: ['単勝', '馬連', '馬単', '三連複', '三連単', 'ワイド', '見'] },
  { id: 'chukichi', label: '中吉', weight: 25, ratings: [3, 5], tickets: ['単勝', '複勝', 'ワイド', '馬連', '三連複', '見'] },
  { id: 'kichi', label: '吉', weight: 35, ratings: [2, 4], tickets: ['単勝', '複勝', 'ワイド', '馬連', '見'] },
  { id: 'kyo', label: '凶', weight: 15, ratings: [1, 3], tickets: ['複勝', 'ワイド', '見', '見'] },
  { id: 'daikyo', label: '大凶', weight: 10, ratings: [1, 2], tickets: ['複勝', '見', '見', '見'] },
];
// 大吉の通常を1%、中吉の通常を1%だけ法則崩れへ振替。
export const EFFECT_WEIGHTS = {
  daikichi: [['normal',19],['hint',20],['shooting',20],['gold',20],['rainbow',20],['death',1]],
  chukichi: [['normal',34],['hint',30],['shooting',25],['gold',10],['rainbow',1]],
  kichi: [['normal',50],['hint',30],['shooting',15],['gold',5]],
  kyo: [['normal',45],['dark',30],['red',20],['shooting',5]],
  daikyo: [['normal',25],['dark',20],['red',30],['death',25]],
};
export const EFFECTS = {
  normal: { label: 'おみくじを振っています…', level: 0 },
  hint: { label: '何かの気配…？', level: 1 },
  shooting: { label: '流れ星！', level: 2 },
  gold: { label: '金の蹄鉄…！', level: 3 },
  rainbow: { label: '虹が出た！', level: 4 },
  dark: { label: '風向きが変わった…', level: 1, ominous: true },
  red: { label: '不吉な星が…', level: 2, ominous: true },
  death: { label: 'あの星は…まさか！？', level: 3, ominous: true },
};
export const COLORS = [
  ['赤','#d83c46'],['青','#2874cd'],['黄','#f3c441'],['緑','#26845d'],['白','#ffffff'],
  ['黒','#303038'],['桃','#ef8dae'],['紫','#8661be'],['橙','#ec8d34'],
];
export const MESSAGES = {
  daikichi: [
    '気になる穴馬を1頭残してみよう。','今日は軸を信じる日。','最初に気になった馬を忘れずに。','買い目を広げすぎなければ吉。','人気だけで切るのはもったいない。',
    'パドックでは、落ち着いた目で見てみよう。','迷いが少ないレースを大切に。','自分の予想を、最後に一度だけ確認。','好きな馬を応援する気持ちも大切に。','買う前に決めた予算が、お守りになる。',
    'おいしいオッズにも、冷静な目を。','本命の良いところを一つ言葉にしてみよう。','穴馬の理由が説明できれば、気持ちよく応援できる。','当たった後も、ペースはそのままで。','少ない買い目で楽しめるなら、それが今日の吉。',
    '今日のひらめきは、メモに残しておこう。','気持ちに余裕がある時こそ、確認を丁寧に。','幸運は、焦らない人のところにもやってくる。','見送る判断にも、自信を持っていい。','レースを楽しめたら、それだけでも良い一日。',
  ],
  chukichi: [
    '欲張らず、狙いを絞ると良さそう。','本命と穴のバランスを大切に。','最後の一頭は直感も悪くない。','オッズに惑わされすぎないように。','迷った買い目は、理由を確かめよう。',
    '予想を変えるなら、根拠も一緒に。','得意な条件のレースから見てみよう。','締切直前より、少し早めの確認を。','今日の目標は、納得できる買い方。','応援する馬の良さを、もう一度思い出そう。',
    '休憩を挟むと、予想の景色も変わる。','人気馬にも穴馬にも、同じ目を向けよう。','点数と予算のバランスを見直そう。','気になる一頭は、過去走を軽く確認。','買わないレースを決めるのも作戦。',
    '小さな的中も、素直に喜んでいい。','周りの予想は、参考程度に。','レース前に一息つけば、気持ちも整う。','慣れた買い方で楽しむのも悪くない。','今日は自分のペースを守ってみよう。',
  ],
  kichi: [
    '今日は平常運転。','深追いしなければ穏やかな一日。','自信のあるレースだけ参加しよう。','迷ったら買い目を減らしてみよう。','いつもの確認が、いちばんのお守り。',
    '馬番の入力は、最後にもう一度。','無理に穴馬を探さなくても大丈夫。','見送りながら観戦する楽しさもある。','決めていた予算を、今日もそのままに。','まずは出馬表をゆっくり眺めよう。',
    '焦るほど、いったん手を止めて。','気になる馬の応援だけでも楽しめる。','情報を増やしすぎたら、一度整理しよう。','大きな勝負より、気楽な観戦を。','一つの結果で、自分の予想を全否定しないで。',
    '買い目は、後から見て分かる形に。','好きなレースを、好きなペースで。','予想の答え合わせも、競馬の楽しみ。','今日の反省は、短くメモするくらいで。','当たっても外れても、休憩は忘れずに。',
  ],
  kyo: [
    '買い目を増やすほど泥沼の予感。','最終確認を忘れずに。','今日の敵は「なんとなく買う」。','熱くなったら一度画面を閉じよう。','締切の焦りで、予定を変えないこと。',
    '追いかける前に、予算を見直そう。','迷いが大きいレースは、見送ってもいい。','その買い足しに、理由はありますか。','一つ外れたからといって、次の金額を増やさないで。','馬番とレース番号を、丁寧に確認。',
    '周りの勢いにつられず、自分のペースで。','勝ちたい気持ちが強いほど、ひと休み。','オッズだけで飛びつくのは、少し待って。','予想がまとまらない日は、観戦を楽しもう。','残り予算を見てから、次を考えよう。',
    '買わない勇気も、今日のお守り。','さっきの外れは、さっきのレースの話。','予想をころころ変える前に、一度整理。','無理に全レースへ参加しなくて大丈夫。','今日は財布にも、休憩時間を。',
  ],
  daikyo: [
    '今日の最強馬券は「見」かもしれない。','財布を守るのも立派な勝負。','その追加購入、本当に必要ですか。','最終レースで取り返そうとしないこと。','明日というレースもあります。',
    '今日は応援団に徹するのもあり。','予算を使い切る必要はありません。','負けを埋めるための一枚は、いったん保留。','おみくじは大凶でも、休日は楽しくできる。','星が光ったら、財布は閉じてもいい。',
    'レースを見るだけなら、買い目はゼロ点。','焦りを感じたら、飲み物でひと息。','追加の入金より、今日の終了を考えよう。','負けた金額を、次の目標にしないで。','深追いの前に、画面から目を離そう。',
    '大凶を引いた話も、今日の思い出になる。','運勢よりも、決めた予算が頼りになる。','買わずに予想する日があってもいい。','財布に残ったお金も、立派な成果。','今日は無事に楽しめたら、それで合格。',
  ],
};

export function weighted(items, random = Math.random) {
  const total = items.reduce((sum, item) => sum + item[1], 0);
  let position = random() * total;
  for (const [value, weight] of items) { position -= weight; if (position < 0) return value; }
  return items.at(-1)[0];
}
function integer(min, max, random) { return min + Math.floor(random() * (max - min + 1)); }
function pick(items, random) { return items[integer(0, items.length - 1, random)]; }

export function draw(random = Math.random) {
  const fortune = weighted(FORTUNES.map(item => [item, item.weight]), random);
  const effect = weighted(EFFECT_WEIGHTS[fortune.id], random);
  const color = pick(COLORS, random);
  // 演出バリエーションもボタン押下時点で確定。再生中は乱数を使用しない。
  return Object.freeze({
    fortune: fortune.id, label: fortune.label,
    battle: integer(...fortune.ratings, random), axis: integer(...fortune.ratings, random), outsider: integer(...fortune.ratings, random),
    number: integer(1, 18, random), color: color[0], colorHex: color[1],
    ticket: pick(fortune.tickets, random), message: pick(MESSAGES[fortune.id], random),
    effect, shooting: weighted([['white',65],['gold',28],['triple',7]],random),
    horse: ['gold','rainbow'].includes(effect) ? 'gold' : weighted([['dark',70],['white',30]],random),
  });
}

/**
 * Demo story content for development.
 *
 * Written out in full rather than lorem-ipsum so the Library, reader, book
 * builder and print renderer can all be exercised with realistic Turkish text
 * of the right length for each age band.
 */

export interface SeedStoryPage {
  text: string;
  illustrationPrompt: string;
}

export interface SeedStory {
  key: string;
  title: string;
  summary: string;
  heroName: string;
  heroType: 'CHILD' | 'ANIMAL' | 'FANTASY' | 'ROBOT' | 'CUSTOM';
  themes: string[];
  ageRange: 'AGE_0_2' | 'AGE_3_5' | 'AGE_6_8' | 'AGE_9_12';
  durationTarget: 'SHORT' | 'MEDIUM' | 'LONG';
  childKey: 'ege' | 'ada' | null;
  pages: SeedStoryPage[];
}

export const SEED_STORIES: SeedStory[] = [
  {
    key: 'kayip-yildiz',
    title: 'Ege ve Kayıp Yıldız',
    summary:
      'Ege, gökyüzünden düşen küçük bir yıldızı ailesine kavuşturmak için uzaya doğru yola çıkar.',
    heroName: 'Ege',
    heroType: 'CHILD',
    themes: ['space', 'adventure'],
    ageRange: 'AGE_6_8',
    durationTarget: 'MEDIUM',
    childKey: 'ege',
    pages: [
      {
        text: 'Ege o akşam yatağına uzandığında pencereden içeri küçük bir ışık süzüldü. Işık önce halının üzerinde dolandı, sonra yastığının kenarına kondu. Ege doğrulup baktı: avucunun içine sığacak kadar küçük bir yıldızdı bu. Titriyordu. "Korkma," dedi Ege usulca. "Ben buradayım."',
        illustrationPrompt:
          'A small child sitting up in bed at night, cupping a tiny glowing star in both hands, warm lamplight, soft watercolour children\'s book illustration.',
      },
      {
        text: 'Yıldız çok yorgundu. Işığı bir yanıp bir sönüyordu. "Evimi kaybettim," diye fısıldadı. "Kardeşlerim gökyüzünün en üst rafında beni bekliyor ama yolu unuttum." Ege bir an düşündü. Sonra yorganını itip yatağından indi. "Öyleyse birlikte buluruz," dedi.',
        illustrationPrompt:
          'A tiny star with a sad face resting on a pillow, dim flickering glow, child leaning in to listen, soft watercolour storybook style.',
      },
      {
        text: 'Dolabın en altında, kışlık botların arkasında duran karton kutuyu çıkardı. Yaz boyunca üzerinde çalıştığı roketti bu. Boyaları biraz akmıştı, bir kanadı da eğriydi. Ama Ege ona baktığında yalnızca bir şey görüyordu: gitmeye hazır.',
        illustrationPrompt:
          'A child pulling a hand-painted cardboard rocket out of a wardrobe, winter boots scattered around, cosy bedroom, soft watercolour illustration.',
      },
      {
        text: 'Yıldızı göğsündeki cebe yerleştirdi, kemerini bağladı ve gözlerini kapattı. Roket önce hafifçe sallandı, sonra halının üzerinden bir karış yükseldi. Pencere kendiliğinden açıldı. Gece serindi ve kokusu yağmurdan sonraki bahçe gibiydi.',
        illustrationPrompt:
          'A cardboard rocket lifting a few centimetres off a bedroom rug, window swinging open to a starry night, gentle motion, soft watercolour.',
      },
      {
        text: 'Uçarlarken aşağıda kalan mahalleyi gördüler. Sokak lambaları küçücük noktalara dönüştü. Ege\'nin evi, sonra sokağı, sonra bütün şehir avucunun içine sığdı. "Buradan bakınca," dedi yıldız, "herkesin bir ışığı var."',
        illustrationPrompt:
          'View from above of a small Turkish neighbourhood at night, warm yellow windows, a cardboard rocket rising, soft watercolour storybook.',
      },
      {
        text: 'Bulutların arasında bir kuş sürüsüne rastladılar. Kuşlar güneye gidiyordu. "Yolunuzu nasıl buluyorsunuz?" diye sordu Ege. En yaşlı kuş kanadını açtı: "Biz yolu ezberlemeyiz. İçimizde bir yön duygusu vardır. Sen de dinlersen duyarsın."',
        illustrationPrompt:
          'A flock of migrating birds flying through moonlit clouds beside a small cardboard rocket, an elder bird with spread wings, soft watercolour.',
      },
      {
        text: 'Ege gözlerini kapatıp dinledi. Önce yalnızca rüzgârı duydu. Sonra, çok uzaktan gelen ince bir çınlama. Yıldız cebinde kıpırdandı. "Duyuyor musun?" dedi heyecanla. "Bu kardeşlerimin sesi!"',
        illustrationPrompt:
          'A child with closed eyes listening intently inside a small rocket, faint silver sound-waves in the air, tiny star glowing brighter, soft watercolour.',
      },
      {
        text: 'Sesi izlediler. Gökyüzünün en üst rafına vardıklarında Ege nefesini tuttu. Yüzlerce yıldız oradaydı; kimi büyük, kimi minik, hepsi bir arada parlıyordu. Aralarında yalnızca bir boşluk vardı. Tam ortada, küçük ve yıldızsız.',
        illustrationPrompt:
          'A vast shelf of stars in deep night sky with one empty gap in the middle, small rocket approaching, awe, soft watercolour storybook.',
      },
      {
        text: 'Ege cebinden yıldızı çıkardı ve avucunu açtı. Yıldız bir an duraksadı. "Ya yerimi unutmuşlarsa?" Ege gülümsedi. "Boşluk hâlâ orada duruyor," dedi. "Kimse doldurmamış. Seni beklemişler."',
        illustrationPrompt:
          'A child holding out an open palm with a hesitant tiny star on it, the star gap visible behind, tender moment, soft watercolour.',
      },
      {
        text: 'Yıldız havalandı. Boşluğa yerleştiğinde bütün gökyüzü bir anlığına daha parlak oldu. Ege gözlerini kısmak zorunda kaldı. Sonra ışık yumuşadı ve her şey yerli yerine oturdu.',
        illustrationPrompt:
          'A tiny star settling into its place among hundreds of stars, a bright flash filling the sky, child shielding eyes, soft watercolour.',
      },
      {
        text: '"Teşekkür ederim," dedi yıldız yukarıdan. "Sana bir şey bırakıyorum." Ege avucuna baktı. Orada, yıldızın durduğu yerde küçük bir ışık lekesi kalmıştı. Sönmüyordu.',
        illustrationPrompt:
          'A child looking at a small warm glow left on their palm, night sky full of stars above, gentle wonder, soft watercolour.',
      },
      {
        text: 'Ege eve döndüğünde yorganı hâlâ sıcaktı. Roketi dolabın en altına geri koydu. Yatağına uzandı ve avucunu göğsünün üzerine bastırdı. O gece, ve ondan sonraki bütün geceler, karanlıkta yalnız olmadığını bildi. İyi geceler, Ege.',
        illustrationPrompt:
          'A child asleep in bed with one hand on their chest, a faint warm glow between the fingers, moonlit bedroom, peaceful, soft watercolour.',
      },
    ],
  },
  {
    key: 'uykuya-kusen-ayicik',
    title: 'Uykuya Küsen Ayıcık',
    summary: 'Uyumak istemeyen küçük bir ayı, ormanın gece nasıl dinlendiğini keşfeder.',
    heroName: 'Pamuk',
    heroType: 'ANIMAL',
    themes: ['sleep', 'animals'],
    ageRange: 'AGE_3_5',
    durationTarget: 'SHORT',
    childKey: 'ada',
    pages: [
      {
        text: 'Küçük ayı Pamuk uyumak istemiyordu. "Uyursam bir şey kaçırırım," dedi.',
        illustrationPrompt:
          'A small fluffy bear cub sitting up in a cosy den, arms crossed, refusing to sleep, soft watercolour children\'s book.',
      },
      {
        text: 'Annesi gülümsedi. "Gel," dedi. "Ormanın nasıl uyuduğuna birlikte bakalım."',
        illustrationPrompt:
          'A mother bear gently holding her cub\'s paw at the mouth of a den, warm evening light, soft watercolour.',
      },
      {
        text: 'Dışarıda tavşanlar çoktan yuvalarına girmişti. Kulakları bile uyuyordu.',
        illustrationPrompt:
          'Sleeping rabbits curled up in a burrow, ears folded down, moonlight, soft watercolour storybook.',
      },
      {
        text: 'Kuşlar dallarda tüylerini kabartmış, başlarını kanatlarının altına saklamıştı.',
        illustrationPrompt:
          'Small birds asleep on a branch with heads tucked under wings, fluffed feathers, night sky, soft watercolour.',
      },
      {
        text: 'Dere bile yavaşlamıştı. Şırıltısı artık bir fısıltı gibiydi.',
        illustrationPrompt:
          'A slow-moving forest stream under moonlight, very still water, soft watercolour illustration.',
      },
      {
        text: 'Pamuk esnedi. "Herkes uyuyor," dedi. "Demek hiçbir şey kaçırmıyorum."',
        illustrationPrompt:
          'A bear cub yawning widely beside its mother in a quiet moonlit forest, soft watercolour.',
      },
      {
        text: 'Annesi onu kucağına aldı. Yumuşacıktı. Sıcacıktı.',
        illustrationPrompt:
          'A mother bear cradling her sleepy cub, warm and soft, cosy den interior, soft watercolour.',
      },
      {
        text: 'Pamuk gözlerini kapattı. Orman da onunla birlikte uyudu. İyi geceler, Pamuk.',
        illustrationPrompt:
          'A bear cub fast asleep in its mother\'s arms, whole forest sleeping around them, stars above, soft watercolour.',
      },
    ],
  },
  {
    key: 'ormanin-kasifi',
    title: 'Ormanın En Küçük Kaşifi',
    summary:
      'Ada, ormanda kaybolan minik bir kirpiyi evine götürürken cesaretin ne demek olduğunu öğrenir.',
    heroName: 'Ada',
    heroType: 'CHILD',
    themes: ['adventure', 'animals', 'courage'],
    ageRange: 'AGE_3_5',
    durationTarget: 'MEDIUM',
    childKey: 'ada',
    pages: [
      {
        text: 'Ada ormana her zaman babasıyla girerdi. O gün ilk kez birkaç adım önden yürüdü.',
        illustrationPrompt:
          'A small girl walking a few steps ahead of her father on a sunlit forest path, dappled light, soft watercolour.',
      },
      {
        text: 'Yolun kenarında minicik bir ses duydu. Eğildi. Yaprakların arasında bir kirpi vardı.',
        illustrationPrompt:
          'A tiny hedgehog peeking out from fallen leaves, a girl crouching down to look, soft watercolour storybook.',
      },
      {
        text: '"Kayboldum," dedi kirpi. "Evim büyük meşenin altındaydı ama her ağaç birbirine benziyor."',
        illustrationPrompt:
          'A small worried hedgehog surrounded by many identical-looking tall trees, soft watercolour.',
      },
      {
        text: 'Ada etrafına baktı. Gerçekten de her ağaç aynıydı. İçi biraz ürperdi.',
        illustrationPrompt:
          'A girl looking up at a circle of tall similar trees, feeling small, gentle unease, soft watercolour.',
      },
      {
        text: 'Sonra hatırladı: babası hep "meşenin kabuğu daha çatlaktır" derdi. Parmağıyla ağaçlara dokundu.',
        illustrationPrompt:
          'A girl touching tree bark with her fingertips, comparing textures, focused expression, soft watercolour.',
      },
      {
        text: 'Üçüncü ağaçta parmakları derin çizgilere denk geldi. "Buldum!" dedi. "İşte meşen."',
        illustrationPrompt:
          'A girl beaming with her hand on the deeply grooved bark of a great oak, hedgehog in her other arm, soft watercolour.',
      },
      {
        text: 'Kirpi köklerin arasındaki yuvasına koştu. İçeriden üç minik burun uzandı.',
        illustrationPrompt:
          'A hedgehog reaching a burrow between oak roots, three tiny hedgehog noses poking out, soft watercolour.',
      },
      {
        text: '"Sen çok cesursun," dedi kirpi. Ada güldü. "Korkmadım demedim," dedi. "Sadece durmadım."',
        illustrationPrompt:
          'A hedgehog looking up gratefully at a smiling girl, warm afternoon light through leaves, soft watercolour.',
      },
      {
        text: 'Babası arkasından yetişti. "Yolu sen mi buldun?" diye sordu. Ada başını salladı.',
        illustrationPrompt:
          'A father catching up on a forest path, looking proudly at his daughter, soft watercolour.',
      },
      {
        text: 'Eve dönerken bu kez Ada önden yürüdü. Ve hiç arkasına bakmadı. İyi geceler, Ada.',
        illustrationPrompt:
          'A girl leading the way home along a golden-lit forest path, father following behind, soft watercolour.',
      },
    ],
  },
];

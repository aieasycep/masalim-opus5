import type { ClientErrorCode } from '@masalim/types';

/**
 * Every error the parent can see, in their language.
 *
 * The tone rule from the design brief applies without exception: never a
 * technical term, never a moderation code, never blame. A failure should read
 * like a person apologising, and always leaves a way forward.
 */
export const TR_ERRORS: Record<ClientErrorCode, { title: string; message: string }> = {
  NETWORK_UNAVAILABLE: {
    title: 'İnternet bağlantın yok gibi',
    message: 'Bağlantını kontrol edip tekrar deneyebilirsin. Girdiklerin burada duruyor.',
  },
  INTERNAL_ERROR: {
    title: 'Küçük bir aksilik oldu',
    message: 'Bir sorun çıktı ama düzeltiyoruz. Birazdan tekrar dener misin?',
  },
  VALIDATION_FAILED: {
    title: 'Bazı bilgiler eksik',
    message: 'İşaretli alanları kontrol edip tekrar dener misin?',
  },
  NOT_FOUND: {
    title: 'Bulamadık',
    message: 'Aradığın şey burada değil. Silinmiş olabilir.',
  },
  FORBIDDEN: {
    title: 'Buraya erişimin yok',
    message: 'Bu içerik sana ait değil.',
  },
  UNAUTHORIZED: {
    title: 'Tekrar giriş yapman gerekiyor',
    message: 'Oturumun sona ermiş. Giriş yaptığında kaldığın yerden devam edersin.',
  },
  RATE_LIMITED: {
    title: 'Biraz hızlı gittik',
    message: 'Kısa bir mola verip tekrar dener misin?',
  },
  CONFLICT: {
    title: 'Bu işlem zaten yapılmış',
    message: 'Aynı işlemi iki kez başlatmışsın gibi görünüyor.',
  },
  SERVICE_UNAVAILABLE: {
    title: 'Şu an biraz yoğunuz',
    message: 'Birkaç dakika sonra tekrar dener misin?',
  },
  APP_UPDATE_REQUIRED: {
    title: 'Yeni bir sürüm var',
    message: 'Devam etmek için uygulamayı güncellemen gerekiyor.',
  },
  FEATURE_DISABLED: {
    title: 'Bu özellik şu an kapalı',
    message: 'Çok yakında yeniden açılacak.',
  },

  INVALID_CREDENTIALS: {
    title: 'E-posta veya şifre hatalı',
    message: 'Bilgilerini kontrol edip tekrar dener misin?',
  },
  EMAIL_ALREADY_REGISTERED: {
    title: 'Bu e-posta zaten kayıtlı',
    message: 'Giriş yapmayı deneyebilir ya da şifreni sıfırlayabilirsin.',
  },
  TOKEN_EXPIRED: {
    title: 'Oturumun sona ermiş',
    message: 'Tekrar giriş yaptığında kaldığın yerden devam edersin.',
  },
  TOKEN_INVALID: {
    title: 'Oturum doğrulanamadı',
    message: 'Güvenliğin için tekrar giriş yapmanı istiyoruz.',
  },
  REFRESH_TOKEN_REUSED: {
    title: 'Güvenlik için çıkış yaptık',
    message: 'Hesabında beklenmedik bir durum fark ettik. Lütfen tekrar giriş yap.',
  },
  SOCIAL_AUTH_FAILED: {
    title: 'Giriş tamamlanamadı',
    message: 'Tekrar deneyebilir ya da e-posta ile devam edebilirsin.',
  },
  ACCOUNT_DELETED: {
    title: 'Bu hesap silinmiş',
    message: 'Yeni bir hesap oluşturarak devam edebilirsin.',
  },

  PREMIUM_REQUIRED: {
    title: 'Bu özellik Premium’da',
    message: 'Premium’a geçtiğinde bu özelliği hemen kullanmaya başlayabilirsin.',
  },
  QUOTA_EXCEEDED: {
    title: 'Bu ayki hakkın doldu',
    message: 'Gelecek ay hakkın yenilenecek. Dilersen Premium’a geçebilirsin.',
  },
  VOICE_PROFILE_LIMIT_REACHED: {
    title: 'Ses sayısı sınırına ulaştın',
    message: 'Yeni bir ses eklemek için önce mevcut seslerden birini silebilirsin.',
  },

  CHILD_NOT_FOUND: {
    title: 'Bu profili bulamadık',
    message: 'Çocuk profili silinmiş olabilir.',
  },

  STORY_NOT_FOUND: {
    title: 'Bu masalı bulamadık',
    message: 'Silinmiş olabilir. Kütüphanenden diğer masallara göz atabilirsin.',
  },
  STORY_GENERATION_FAILED: {
    title: 'Masal hazırlanırken küçük bir aksilik oldu',
    message: 'Seçtiklerin duruyor. Tekrar denediğimizde kaldığımız yerden devam ederiz.',
  },
  STORY_GENERATION_TIMEOUT: {
    title: 'Masal biraz uzun sürdü',
    message: 'Seçtiklerini kaybetmedik. Tekrar denemek ister misin?',
  },
  STORY_CONTENT_NOT_SUITABLE: {
    title: 'Bu fikri masala dönüştüremedik',
    message:
      'Bu konuyla çocuklara uygun bir hikâye oluşturamıyoruz. İstersen fikri birlikte değiştirebiliriz.',
  },
  STORY_NOT_READY: {
    title: 'Masal henüz hazır değil',
    message: 'Hazırlanması birkaç saniye daha sürebilir.',
  },

  VOICE_PROFILE_NOT_FOUND: {
    title: 'Bu sesi bulamadık',
    message: 'Ses profili silinmiş olabilir.',
  },
  VOICE_CONSENT_REQUIRED: {
    title: 'Önce izin vermen gerekiyor',
    message: 'Sesini oluşturabilmemiz için onay kutusunu işaretlemen yeterli.',
  },
  VOICE_PROCESSING_FAILED: {
    title: 'Ses oluşturulurken bir sorun yaşadık',
    message: 'Kaydın güvende. Yeniden okumana gerek yok, tekrar deneyebiliriz.',
  },
  VOICE_NOT_READY: {
    title: 'Ses henüz hazır değil',
    message: 'Hazır olduğunda sana haber vereceğiz.',
  },
  AUDIO_TOO_SHORT: {
    title: 'Kayıt biraz kısa kalmış',
    message: 'Biraz daha uzun okursan sesini çok daha iyi tanıyabiliriz.',
  },
  AUDIO_TOO_LONG: {
    title: 'Kayıt biraz uzun olmuş',
    message: 'Bir dakikaya yakın bir kayıt yeterli.',
  },
  AUDIO_TOO_QUIET: {
    title: 'Sesini zor duyduk',
    message: 'Telefonu biraz yaklaştırıp tekrar dener misin?',
  },
  AUDIO_TOO_NOISY: {
    title: 'Arka planda biraz ses var',
    message: 'Daha sessiz bir yerde kaydettiğinde çok daha iyi sonuç alırız.',
  },
  AUDIO_CLIPPED: {
    title: 'Ses biraz fazla yüksek',
    message: 'Telefonu biraz uzaklaştırıp tekrar dener misin?',
  },
  AUDIO_MOSTLY_SILENT: {
    title: 'Kayıtta konuşma duyamadık',
    message: 'Mikrofonun açık olduğundan emin olup tekrar dener misin?',
  },
  AUDIO_FILE_CORRUPT: {
    title: 'Kayıt okunamadı',
    message: 'Kaydı tekrar almamız gerekiyor.',
  },

  NARRATION_NOT_FOUND: {
    title: 'Bu seslendirmeyi bulamadık',
    message: 'Masalı yeni bir sesle yeniden seslendirebilirsin.',
  },
  NARRATION_FAILED: {
    title: 'Seslendirme tamamlanamadı',
    message: 'Masalın metni güvende. Tekrar deneyebiliriz.',
  },
  NARRATION_VOICE_REQUIRED: {
    title: 'Bir ses seçmen gerekiyor',
    message: 'Masalı kimin anlatmasını istersin?',
  },

  ILLUSTRATION_FAILED: {
    title: 'Görseller tamamlanamadı',
    message: 'Masalın duruyor. Görselleri tekrar oluşturmayı deneyebiliriz.',
  },
  ILLUSTRATION_SET_NOT_FOUND: {
    title: 'Görselleri bulamadık',
    message: 'Masalını yeniden resimlendirebilirsin.',
  },

  BOOK_NOT_FOUND: {
    title: 'Bu kitabı bulamadık',
    message: 'Kitap silinmiş olabilir.',
  },
  BOOK_RENDER_FAILED: {
    title: 'Kitap hazırlanamadı',
    message: 'Sayfaların duruyor. Tekrar deneyebiliriz.',
  },
  BOOK_NOT_READY_FOR_PRINT: {
    title: 'Kitap baskıya hazır değil',
    message: 'Önce tüm sayfaların görsellerini tamamlamamız gerekiyor.',
  },

  ORDER_NOT_FOUND: {
    title: 'Bu siparişi bulamadık',
    message: 'Siparişlerim bölümünden diğer siparişlerine bakabilirsin.',
  },
  ORDER_CREATION_FAILED: {
    title: 'Sipariş oluşturulamadı',
    message: 'Hiçbir ücret alınmadı. Tekrar deneyebilirsin.',
  },
  ORDER_NOT_CANCELLABLE: {
    title: 'Bu sipariş artık iptal edilemiyor',
    message: 'Kitabın baskıya girmiş. Yardım için bize yazabilirsin.',
  },
  PAYMENT_FAILED: {
    title: 'Ödeme tamamlanamadı',
    message: 'Hiçbir ücret alınmadı. Farklı bir kartla tekrar deneyebilirsin.',
  },
  PAYMENT_DECLINED: {
    title: 'Kartın onaylanmadı',
    message: 'Bankanla görüşebilir ya da farklı bir kart deneyebilirsin.',
  },
  PAYMENT_VERIFICATION_FAILED: {
    title: 'Ödemeyi doğrulayamadık',
    message: 'Ücret alındıysa kısa sürede iade edilir. Bize yazabilirsin.',
  },
  ADDRESS_INVALID: {
    title: 'Adreste eksik bilgi var',
    message: 'İl, ilçe ve posta kodunu kontrol eder misin?',
  },
  ADDRESS_NOT_FOUND: {
    title: 'Bu adresi bulamadık',
    message: 'Yeni bir teslimat adresi ekleyebilirsin.',
  },
  PRODUCT_UNAVAILABLE: {
    title: 'Bu seçenek şu an mevcut değil',
    message: 'Farklı bir boyut veya kapak seçebilirsin.',
  },

  UPLOAD_FAILED: {
    title: 'Yükleme tamamlanamadı',
    message: 'Kaydın cihazında duruyor. Tekrar göndermeyi deneyebiliriz.',
  },
  UPLOAD_TOO_LARGE: {
    title: 'Dosya biraz büyük',
    message: 'Daha küçük bir dosyayla tekrar dener misin?',
  },
  UPLOAD_TYPE_NOT_ALLOWED: {
    title: 'Bu dosya türünü kullanamıyoruz',
    message: 'Farklı bir dosya seçebilirsin.',
  },
  ASSET_NOT_FOUND: {
    title: 'Dosyayı bulamadık',
    message: 'Dosya silinmiş olabilir.',
  },

  JOB_NOT_FOUND: {
    title: 'İşlemi bulamadık',
    message: 'İşlem tamamlanmış olabilir.',
  },
  JOB_NOT_RETRYABLE: {
    title: 'Bu işlem tekrar denenemiyor',
    message: 'Baştan başlatman gerekiyor.',
  },

  SUBSCRIPTION_VERIFICATION_FAILED: {
    title: 'Aboneliğini doğrulayamadık',
    message: 'Birazdan tekrar deneyeceğiz. Ücret alındıysa aboneliğin aktifleşecek.',
  },
};

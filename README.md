# Odyoloji Makale Kütüphanesi — Prototip

Bu paket, iPad ve masaüstü tarayıcılarda çalışan tek kullanıcılı bir akademik makale/not kütüphanesi prototipidir.

## Özellikler
- Ders / alan ve alt başlık hiyerarşisi
- Orijinal makale PDF yükleme
- Ayrı **özet PDF** yükleme (GoodNotes dışa aktarımı / el yazısı not PDF’si)
- Kendi özetini ve notlarını saklama
- Makale ekranında **Özetim / Makale / Birlikte** sekmeleri; Özetim sekmesinde özet PDF + metin notları
- Başlık, yazar, ders, konu, etiket ve not içinde arama
- Yıldızlı / tezde kullanılacak, tekrar okunacak, özeti eksik ve son eklenen filtreleri
- APA 7 biçiminde kaynakça üretme ve kopyalama
- Tarayıcı içinde yerel saklama (localStorage + IndexedDB)
- JSON yedek dışa/içe aktarma

## Çalıştırma
En sorunsuz kullanım için klasörü basit bir yerel web sunucusuyla açın.

### macOS / Windows / Linux (Python varsa)
```bash
python3 -m http.server 8080
```
Sonra tarayıcıdan `http://localhost:8080` adresini açın.

Alternatif olarak `index.html` dosyasına çift tıklayarak da açabilirsiniz; ancak bazı tarayıcı güvenlik özellikleri PDF görüntülemeyi kısıtlayabilir.

## iPad kullanım notu
Bu prototip Safari üzerinde kullanılabilir. Gerçek üretim sürümünde iCloud/hesap senkronizasyonu, PencilKit ile doğrudan el yazısı, PDF metin indeksleme/OCR ve otomatik DOI/metadata çekme eklenebilir.

## Veri gizliliği
Bu prototip sunucuya veri göndermez. Makale bilgileri tarayıcı yerel depolamasında, PDF dosyaları IndexedDB içinde tutulur.

## Önemli sınırlama
JSON yedek şu anda PDF dosyalarının kendisini içermez; yalnızca makale kayıtlarını ve metin alanlarını dışa aktarır. Üretim sürümünde tam yedekleme ZIP/Cloud biçiminde yapılmalıdır.


## Apple Pencil ile el yazısı

Bir makaleyi açıp **EL YAZISI** sekmesine geçin. iPad üzerinde Apple Pencil ile doğrudan yazabilir, kalem veya fosforlu kalem kullanabilir, silgi seçebilir ve geri/ileri alabilirsiniz. Çizimler makale kaydıyla birlikte tarayıcının yerel depolamasında otomatik saklanır. “Yalnızca Apple Pencil / kalem” seçeneği açıkken parmakla kaydırma yanlışlıkla çizim oluşturmaz; test amacıyla bilgisayarda mouse da desteklenir.

Not: Bu prototip tarayıcı tabanlıdır. Çok yoğun el yazısı kullanımı için sonraki üretim sürümünde çizim verilerini IndexedDB/iCloud gibi daha geniş depolamaya taşımak daha uygundur.

## PDF üzerinde Apple Pencil ile anotasyon

Makale ekranında **MAKALE** sekmesine girin. Önce **Gezin** modunda PDF içinde sayfa değiştirip yakınlaştırabilirsiniz. Ardından **PDF Üzerine Yaz** düğmesine basarak Apple Pencil ile kalem, fosforlu kalem veya silgi kullanabilirsiniz. Geri al / ileri al ve temizle seçenekleri vardır. Anotasyonlar ilgili makaleye bağlı olarak tarayıcıda otomatik saklanır.

Not: Bu prototipte anotasyon katmanı tarayıcının görünen PDF alanına bağlanır. PDF sayfalarını değiştirmek veya kaydırmak için önce **Gezin** moduna dönün. Tam sayfa-bazlı profesyonel PDF anotasyonu, native iPad/PDFKit sürümünde bir sonraki aşama olarak uygulanabilir.

## Akıllı Notlar ve Apple Pencil

Makale sekmesinin sağındaki **Akıllı Notlar** paneli üç şekilde çalışır:

- PDF içindeki bir cümleyi seçip **Kopyala** dedikten sonra **Kopyalanan Cümleyi Notlarıma Ekle** düğmesi, cümleyi tarih/saat etiketiyle Özetim bölümüne ekler.
- iPad'de Apple Scribble açıksa **Kenar Notu** kutusuna Apple Pencil ile yazılan el yazısı iPad tarafından metne çevrilir; yazmayı bıraktıktan yaklaşık 1 saniye sonra otomatik olarak Özetim'e aktarılır.
- PDF üzerine serbest el çizimi yaptıktan sonra **Mevcut El Yazısını Notlara İliştir** düğmesi, anotasyon katmanının görüntüsünü cihaz içindeki IndexedDB'de makaleye bağlı bir el-yazısı notu olarak saklar.

Not: Tarayıcının yerleşik PDF görüntüleyicisi, kalem çizgisinin altındaki cümleyi doğrudan uygulamaya vermediği için yalnızca “altını çizdi ve cümle otomatik okundu” davranışı bu web prototipinde güvenilir değildir. Tam otomatik çizgi-altı metin yakalama için sonraki native iPad sürümünde PDFKit/PencilKit ile metin koordinatlarının eşleştirilmesi gerekir.


## Otomatik makale künyesi
Orijinal makale PDF’si seçildiğinde uygulama PDF’nin ilk sayfalarını ve gömülü metadata bilgisini okuyarak başlık, yazarlar, yıl ve DOI alanlarını otomatik doldurmaya çalışır. DOI bulunursa, internet bağlantısı varken Crossref üzerinden resmi kayıt sorgulanır ve dergi/künye bilgileri daha güvenilir biçimde tamamlanır. Otomatik bulunan bilgiler kaydetmeden önce kullanıcı tarafından kontrol edilebilir. PDF.js ve Crossref sorgusu için bu özellikte internet bağlantısı gerekir; bağlantı yoksa diğer uygulama özellikleri çalışmaya devam eder.


## Mouse desteği
El yazısı ve PDF anotasyon alanlarında Apple Pencil yanında mouse da desteklenir. Kalem, fosforlu kalem, silgi, geri al/ileri al ve temizleme araçları mouse ile kullanılabilir. “Parmakla çizimi kapat” seçeneği açıkken dokunmatik parmak hareketleri çizim yapmaz; mouse ve Apple Pencil çalışmaya devam eder.

## Okuma konumu senkronizasyonu
Uygulama her makale için PDF'de kalınan yeri sayfa numarası ve sayfa içindeki göreli konum olarak kaydeder. **MAKALE**, **EL YAZISI**, **ÖZETİM** ve **BİRLİKTE** sekmeleri arasında geçiş yapıldığında PDF başa dönmez. BİRLİKTE görünümündeki PDF okuyucu da aynı okuma konumunu kullanır; orada kaydırılan konum MAKALE sekmesine geri dönüldüğünde korunur.


## Gezin modunda seçili metni Notlarım'a aktarma
PDF ekranında **Gezin** modundayken mouse, trackpad veya dokunmatik ekranla bir cümleyi/bölümü seçin. Sağdaki **Seçimi Notlarıma Ekle** düğmesine basınca seçili metin doğrudan makalenin **Özetim / Notlarım** alanına eklenir. Pano ile aktarma seçeneği de yedek yöntem olarak korunmuştur.

# Profesyonel akademik çalışma özellikleri

Bu sürümde ana çalışma akışları tek sistem altında koordine edilmiştir:

- **Akıllı alıntı:** Gezin modunda seçilen PDF metni yalnızca metin olarak Notlarım'a eklenir. Kaynak makale, PDF sayfası ve sayfa içi konum arka planda tutulur. Son aktarılan nottan kaynağa dönülebilir.
- **PDF konum hafızası:** Makale, El Yazısı, Özetim ve Birlikte sekmeleri arasında geçerken son okuma sayfası/konumu korunur.
- **Sayfaya bağlı anotasyon:** Kalem, fosforlu kalem ve silgi anotasyonları PDF sayfasına bağlıdır; kaydırma sırasında ekranda yüzmez.
- **Mouse + Apple Pencil:** Çizim ve silgi hem mouse hem Apple Pencil ile çalışır. Parmağı çizimden engelleme seçeneği bağımsızdır.
- **Otomatik künye:** PDF'den DOI aranır; DOI bulunursa Crossref üzerinden başlık, yazar, yıl ve dergi bilgileri doğrulanmaya çalışılır. APA 7 çıktısı bu kayıttan üretilir.
- **Tam metin indeksleme:** PDF metinleri IndexedDB'de saklanır; localStorage kotasını doldurmamak için büyük metinler ana ayar kaydına yazılmaz.
- **Akıllı kütüphane araması:** Başlık, yazar, konu, etiket, kişisel not, alıntı ve indekslenmiş PDF metni birlikte puanlanarak aranır.
- **Akademik Asistan:** Kütüphane genelinde doğal cümlelerle çalışma araması yapılabilir.
- **Makale Asistanı:** İndekslenmiş metinden Amaç / Yöntem / Bulgular / Sonuç / Kısıtlılıklar taslağı çıkarır. Makaleye soru sorulduğunda ilgili cümleleri ve sayfa referanslarını bulur.
- **Benzer makaleler:** Konu, etiket ve başlık benzerliğine göre kütüphanedeki ilişkili çalışmalar önerilir.
- **Tez Havuzu:** Yıldızlanan çalışmalar tez havuzunda toplanır ve toplu APA / Excel / Word çıktısı alınabilir.
- **Makale karşılaştırma:** En az iki çalışma seçilerek yöntem, bulgular, sonuç ve kişisel notlar yan yana karşılaştırılabilir.
- **Toplu PDF ekleme:** Birden fazla PDF aynı anda seçilebilir; her dosyanın metadata/DOI bilgisi okunmaya ve tam metni indekslenmeye çalışılır.
- **Excel ve Word dışa aktarma:** Liste ve tez havuzu Excel uyumlu `.xls` ve Word uyumlu `.doc` olarak dışa aktarılabilir.
- **Tam Yedek ZIP:** Makale kayıtları, orijinal PDF'ler, özet PDF'leri ve arama indeksleri tek ZIP'e yedeklenir. ZIP dosyasını iCloud Drive, Google Drive veya başka bir güvenli alana kaydedebilirsiniz. Aynı ZIP uygulamaya geri yüklenebilir.

## Bilimsel doğruluk notu

Otomatik özet ve “Makaleye Sor” özelliği bu web prototipinde **yerel, kaynak metne dayalı çıkarımsal/ekstraktif** yöntem kullanır. Uydurma bilgi üretmemek için cevaplar yalnızca indekslenmiş PDF cümlelerinden oluşturulur ve mümkün olduğunda sayfa referansı gösterilir. Bunlar bilimsel değerlendirme yerine geçmez; tez veya yayın metnine alınmadan önce orijinal makale kontrol edilmelidir.

Gerçek LLM tabanlı özetleme/semantik embedding sistemi için API anahtarını tarayıcı koduna gömmek güvenli değildir. Profesyonel üretim sürümünde bunun küçük bir güvenli backend üzerinden bağlanması gerekir.

## Yedekleme önerisi

Tarayıcı verileri cihazda tutulur. Düzenli olarak **Tam Yedek ZIP** oluşturup iCloud Drive gibi ayrı bir konuma kaydetmek önerilir. Gerçek zamanlı iCloud senkronizasyonu web prototipinin kapsamı dışındadır; native iPad sürümünde CloudKit ile eklenmelidir.


## iPad'de uygulama gibi kullanma (PWA)

Bu sürüm iPad Ana Ekranı'na kurulabilen bir PWA'dır.

1. Klasörü HTTPS üzerinden yayınlayın (ör. GitHub Pages, Netlify, Cloudflare Pages veya kendi sunucunuz).
2. iPad'de Safari ile uygulama adresini açın.
3. Safari'de **Paylaş** düğmesine dokunun.
4. **Ana Ekrana Ekle** seçeneğini seçin.
5. Ana ekrandaki **Audiology** ikonundan açın.

Ana ekrandan açıldığında tarayıcı sekmeleri görünmeden uygulama görünümünde çalışır. Uygulama kabuğu ilk başarılı açılıştan sonra önbelleğe alınır. PDF dosyaları ve kişisel veriler cihazın IndexedDB/localStorage alanında tutulduğu için düzenli olarak **Tam Yedek ZIP** oluşturmanız önerilir.

> Not: PWA kurulumu ve Service Worker için uygulamanın `file://` olarak değil HTTPS (veya geliştirmede localhost) üzerinden açılması gerekir.


## Tablet Final v2
Bu paket iPad Safari/PWA kullanımı için dokunmatik hedefleri büyütür, yatay/dikey düzeni optimize eder,
Safari form yakınlaştırmasını azaltır, PDF araç çubuğunu tablet kullanımında sabit tutar ve PWA ikon yollarını
GitHub Pages kök diziniyle uyumlu hale getirir. Apple Pencil ve mouse çizimi korunur; parmak gezinme için kullanılabilir.


## v2.3 Kalem / Fosfor davranışı
- **Fosforlu**: yalnızca PDF üzerinde kalıcı görsel hatırlatıcıdır. Sayfaya bağlı saklanır ve Notlarım'a aktarılmaz.
- **Kalem**: PDF üzerinde kalıcıdır; kullanıcı isterse **Kalem Yazısını Nota Ekle** ile son kalem yazısının bulunduğu sayfadaki kalem anotasyonunu Notlarım'a görüntü olarak ekleyebilir.
- Kalem notu oluşturulurken fosfor dahil edilmez. Silgi etkisi korunur.
- Özetim / Notlarım bölümünde eklenen kalem notları görüntülenebilir, ilgili PDF sayfasına dönülebilir veya ayrı olarak silinebilir.


## v2.4 Kalem / Fosfor yeniden düzenlendi
PDF araçları artık doğrudan **Gezin / Kalem / Fosfor / Silgi** şeklindedir.
- Gezin: kaydırma ve metin seçme.
- Kalem: Apple Pencil veya mouse ile yazma; yalnızca Kalem yazıları isteğe bağlı olarak Notlarım'a eklenebilir.
- Fosfor: sarı, kalıcı görsel hatırlatıcıdır; Notlarım'a aktarılmaz.
- Silgi: PDF üzerindeki kalem ve fosfor anotasyonlarını siler.

## v2.5
- Kalem notunun Notlarım'a aktarımı iPad/Safari uyumlu SVG kayıt yöntemiyle düzeltildi.
- Gezin modundaki seçili metin aktarımı korunmuştur.
- Ana ekrana kişisel hediye mesajı eklenmiştir.


## v3.0 Professional Research Workspace
- Güncel Literatür merkezi: konu bazlı güncel PubMed aramaları ve temel odyoloji dergilerine tek tık.
- Yapılandırılmış Literatür Matrisi: amaç, örneklem, yöntem, testler, bulgu, sınırlılık, tez önemi.
- Tez Çalışma Alanı ve tez bölümü atama.
- Okuma durumu: okunmadı / okunuyor / okundu / tekrar incelenecek.
- Gelişmiş filtreler.
- Excel/Word dışa aktarımlarına yapılandırılmış araştırma alanları dahil edildi.
- Mevcut PDF, not, fosfor, kalem notu, arama, yedek ve metadata özellikleri korunmuştur.
- Gerçek çok cihazlı bulut senkronizasyonu ve sunucu tabanlı AI bu statik GitHub Pages paketinde etkin değildir; güvenli backend aşaması gerekir.

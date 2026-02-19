using System.Security.Cryptography;
using System.Text;

namespace MailMarketing.Business;

public static class SecurityHelper
{
    //Bu anahtar senin dijital kasanın anahtarıdır. 
    // Bunu asla kaybetme, değiştirirsen eski şifrelerin hepsi çöp olur
    // 32 karakterlik rastgele bir anahtar belirledik.
    private static readonly string Key = "MailMarketing_Sifreleme_Anahtari_32"; 

    // ŞİFRELEME (Encrypt) - Düz metni okunmaz hale getirir
    public static string Encrypt(string plainText)
    {
        if (string.IsNullOrEmpty(plainText)) return plainText;

        try
        {
            byte[] iv = new byte[16];
            byte[] array;

            using (Aes aes = Aes.Create())
            {
                // Anahtarın tam 32 byte olduğundan emin oluyoruz (boşluklarla tamamlıyoruz)
                aes.Key = Encoding.UTF8.GetBytes(Key.PadRight(32).Substring(0, 32));
                aes.IV = iv;

                ICryptoTransform encryptor = aes.CreateEncryptor(aes.Key, aes.IV);

                using (MemoryStream memoryStream = new MemoryStream())
                {
                    using (CryptoStream cryptoStream = new CryptoStream((Stream)memoryStream, encryptor, CryptoStreamMode.Write))
                    {
                        using (StreamWriter streamWriter = new StreamWriter((Stream)cryptoStream))
                        {
                            streamWriter.Write(plainText);
                        }
                        array = memoryStream.ToArray();
                    }
                }
            }
            return Convert.ToBase64String(array);
        }
        catch
        {
            // Eğer şifrelemede hata olursa boş dön, sistem patlamasın
            return ""; 
        }
    }

    // ŞİFRE ÇÖZME (Decrypt) - Okunmaz metni tekrar düz hale getirir
    public static string Decrypt(string cipherText)
    {
        if (string.IsNullOrEmpty(cipherText)) return cipherText;

        try
        {
            byte[] iv = new byte[16];
            byte[] buffer = Convert.FromBase64String(cipherText);

            using (Aes aes = Aes.Create())
            {
                aes.Key = Encoding.UTF8.GetBytes(Key.PadRight(32).Substring(0, 32));
                aes.IV = iv;

                ICryptoTransform decryptor = aes.CreateDecryptor(aes.Key, aes.IV);

                using (MemoryStream memoryStream = new MemoryStream(buffer))
                {
                    using (CryptoStream cryptoStream = new CryptoStream((Stream)memoryStream, decryptor, CryptoStreamMode.Read))
                    {
                        using (StreamReader streamReader = new StreamReader((Stream)cryptoStream))
                        {
                            return streamReader.ReadToEnd();
                        }
                    }
                }
            }
        }
        catch
        {
            // Eğer şifre zaten düz metinse veya çözülemiyorsa olduğu gibi döndür
            return cipherText;
        }
    }
}
using MailMarketing.Business;
using MailMarketing.Entity;
using MailMarketing.DataAccess;
using Microsoft.Extensions.Hosting;
using System.Threading;
using System.Threading.Tasks;
using System;

namespace MailMarketing.WebUI.Services;

public class MailBackgroundWorker : BackgroundService
{
    private readonly MailService _mailService = new MailService(); 

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            if (MailQueue.TryDequeue(out var mailTask) && mailTask != null)
            {
                // Madde 2.9: Log nesnesini hazırlıyoruz
                var log = new MailLog
                {
                    SentDate = DateTime.Now,
                    SubscriberId = null, 
                    TemplateId = null
                };

                try 
                {
                    // Asenkron motor iş başında!
                    _mailService.SendSystemEmail(mailTask.To, mailTask.Subject, mailTask.Body);
                    
                    log.IsSuccess = true; 
                    Console.WriteLine($"[Worker] BAŞARILI: {mailTask.To}");
                }
                catch (Exception ex)
                {
                    log.IsSuccess = false; 
                    // Eğer MailLog tablanda 'ErrorMessage' kolonu varsa burayı açabilirsin:
                    // log.ErrorMessage = ex.Message; 
                    Console.WriteLine($"[Worker] HATA: {ex.Message}");
                }
                finally
                {
                    //Ne olursa olsun sonucu veritabanına işle (Madde 2.9)
                    SaveLogToDatabase(log);
                }

                // Gmail'i yormayalım, 3 saniye mola
                await Task.Delay(3000, stoppingToken);
            }
            else
            {
                // Kuyruk boşsa 5 saniye uyu
                await Task.Delay(5000, stoppingToken);
            }
        }
    }

    private void SaveLogToDatabase(MailLog log)
    {
        try 
        {
            using (var db = new MailMarketingContext())
            {
                db.MailLogs.Add(log);
                db.SaveChanges();
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[Worker Log Hatası]: {ex.Message}");
        }
    }
}
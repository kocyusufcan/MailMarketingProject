using System.Collections.Concurrent;
using MailMarketing.Entity;

namespace MailMarketing.Business;

public static class MailQueue
{
    // Thread-safe bir kuyruk kullanıyoruz ki aynı anda birden fazla işlem çakışmasın
    private static readonly ConcurrentQueue<MailTask> _queue = new ConcurrentQueue<MailTask>();

    public static void Enqueue(string to, string subject, string body)
    {
        _queue.Enqueue(new MailTask { To = to, Subject = subject, Body = body });
    }

    public static bool TryDequeue(out MailTask? task)
    {
        return _queue.TryDequeue(out task);
    }
}
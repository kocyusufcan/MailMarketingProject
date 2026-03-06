using System.Collections.Generic;

namespace MailMarketing.API.Models;

public class BulkStatusRequest
{
    public List<int> Ids { get; set; } = new List<int>();
    public bool Status { get; set; }
}

# Name-date label-only matches require review

A descriptive label match, including Smith, 2020, is now supporting evidence with score 80 and requires manual review. It is not an automatic replacement, even with Auto-Confirm enabled. Candidates display the incoming entry and maintain the updated-list index mapping. Explicit approval can merge the correction. DOI/content matches retain their existing conflict and ambiguity safeguards. Different numeric labels remain excluded from matching.

Five new regression scenarios cover label-only blocking, explicit approval, identical DOI matching, differing DOI conflict, and multiple candidate blocking. All 63 Reference Updater regression scenarios, TypeScript and diff checks pass. Internal-link and quote tests now explicitly approve their descriptive-label fixtures before checking merge behavior.

Original/output full article copies for the DOI-linked name-date correction pass article 5.7 DTD and actual VTool 5.98.2 with zero errors and skipped checks, retaining two existing warnings. Logs and validation-results.json are saved here. No push performed.

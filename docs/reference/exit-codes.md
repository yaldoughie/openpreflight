# Exit codes

| Code | Meaning                                        |
| ---: | ---------------------------------------------- |
|    0 | Operation completed and passed                 |
|    1 | Operation completed; regressions were detected |
|    2 | Invalid configuration or user input            |
|    3 | Infrastructure/environment failure             |
|    4 | Authentication or authorization failure        |
|    5 | Operation cancelled                            |

An update-installation failure is an execution/application finding when the
environment is healthy; a Docker startup failure is infrastructure. CI should
not rewrite code 3 as a regression.

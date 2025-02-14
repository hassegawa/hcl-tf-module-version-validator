# HCL module version validator

The "lsp-hcl-tf-version" extension for Visual Studio Code helps users validate Terraform module versions in HCL (HashiCorp Configuration Language) files. It ensures that the module versions specified in a Terraform project adhere to defined patterns or rules. By using regular expressions (regex), it checks the module version against expected formats, offering warnings if inconsistencies are found. This extension supports configuration through various settings, allowing users to customize validation behavior.

## File repositories example:
  ![file](https://raw.githubusercontent.com/hassegawa/hcl-tf-module-version-validator/refs/heads/main/images/repositories.json.png)

  * [repositories.json](https://github.com/hassegawa/hcl-tf-module-version-validator/blob/main/repositories.json)

## Repositories path
  ![path](https://raw.githubusercontent.com/hassegawa/hcl-tf-module-version-validator/refs/heads/main/images/repositories.path.PNG)

### erro file not existe
  ![erro_file](https://raw.githubusercontent.com/hassegawa/hcl-tf-module-version-validator/refs/heads/main/images/repositories.NG.png)

## Regex validation
  ![regex](https://raw.githubusercontent.com/hassegawa/hcl-tf-module-version-validator/refs/heads/main/images/regex.example.PNG)

## Extension settings
  ![settings](https://raw.githubusercontent.com/hassegawa/hcl-tf-module-version-validator/refs/heads/main/images/Settings.PNG)

## Regex on code
  ![regex_value](https://raw.githubusercontent.com/hassegawa/hcl-tf-module-version-validator/refs/heads/main/images/regex.found.PNG)

## Warnigs
  ![warnigs](https://raw.githubusercontent.com/hassegawa/hcl-tf-module-version-validator/refs/heads/main/images/warning.exemple.PNG)

## Resolve
  ![resolve](https://raw.githubusercontent.com/hassegawa/hcl-tf-module-version-validator/refs/heads/main/images/list-valid-version.PNG)
    
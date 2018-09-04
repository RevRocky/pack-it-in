# pack-it-in

*A License Manager for Node.js*

*Overview*
==========

Pack-it-in is meant to simplify the process of including FOSS in your project by
analysing the licenses of the software you are including within your project and
generating an easy to read Excel report detailing the licenses used by each
component of your project. There is also no need to worry about analysing your
indirect dependencies. The dependencies of your dependencies will automatically
be analysed and included within the report.

Written with complex, commercial grade software in mind, pack-it-in was written
to be easily configurable in terms of types of licenses permitted for one’s
project as well as the format of the report generated. In addition to this type
of configuration, there is also rudimentary support for other forms of package
analysis. The currently released version includes basic support for handling
cryptographic packages, this will be further detailed below where the
configuration file is detailed.

Using pack-it-in
================

To install pack-it-in, Simply run

[code]npm install -g pack-it-in[/code]

To run the programme, using the default configuration, you can simply run:

**[code]npm pack-it-in[/code]**

This will analyse the project within the current directory, should one exist,
and output and the excel report to license-details.xlsx which will be located in
the same directory where you ran pack-it-in.

If you would like to run the programme using a custom configuration file, one
can simply run

[code]node pack-it-in -c path/to/config/file.json[/code]

**One can also use the longer option and run**

[code] node pack-it-in - - config=path/to/config/file.json[/code]

**Configuration**
=================

A commented version of the default configuration file can be found in
default-config.jsonc. This file provides a detailed explanation of what each
option does and how one can customise the functionality of pack-it-in to their
own needs. As the project grows, default-config.jsonc will grow so that it
remains fully accurate

**Contributing**
================

If you would like to contribute to pack-it-in, please reach out to
<rocky.petkov@yandex.com> or [[]] and we will let you know how you can get
involved with the project.

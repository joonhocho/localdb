#!/usr/bin/node
import shell from 'shelljs';

shell.rm('-rf', 'dist');

if (shell.exec('npm run test').code !== 0) {
  shell.echo('Error: test failed');
  shell.exit(1);
}

if (shell.exec('npm run build').code !== 0) {
  shell.echo('Error: build failed');
  shell.exit(1);
}

shell.cp('LICENSE', 'dist');
shell.cp('README.md', 'dist');
shell.cp('package.json', 'dist');

shell.cd('./dist');
shell.exec('npm publish');

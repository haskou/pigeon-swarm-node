/* eslint-disable no-console */
import 'module-alias/register';
import 'reflect-metadata';
import Kernel from '@app/Kernel';

async function init() {
  console.time('Kernel');
  const kernel = new Kernel();
  console.timeEnd('Kernel');

  console.time(`Environment ${process.env.NODE_ENV} variables`);
  kernel.environmentVariables();
  console.timeEnd(`Environment ${process.env.NODE_ENV} variables`);

  console.time('Dependency Injection');
  await kernel.dependencyInjection();
  console.timeEnd('Dependency Injection');

  console.time('Run server');
  await kernel.runServer();
  console.timeEnd('Run server');

  console.time('Run consumers');
  kernel.addConsumers();
  await kernel.runConsumers();
  console.timeEnd('Run consumers');

  console.time('Run Schedulers');
  kernel.addSchedulers();
  await kernel.runSchedulers();
  console.timeEnd('Run Schedulers');

  console.time('Logs');
  kernel.logs();
  console.timeEnd('Logs');

  console.info('Ready!');
}

init()
  .then(() => {
    console.info('Application started');
  })
  .catch((error) => {
    console.error('Application error', error);
  });

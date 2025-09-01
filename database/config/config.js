// database/config/config.js
import 'dotenv/config';

const common = {
  url: process.env.DATABASE_URL,
  dialect: 'postgres',
  logging: false,
};

export default {
  development: {
    ...common,
    dialectOptions: {
      ssl: false, // en local, pas besoin de SSL
    },
  },
  test: {
    ...common,
    dialectOptions: {
      ssl: {
        require: true,
        rejectUnauthorized: false,
      },
    },
  },
  production: {
    ...common,
    dialectOptions: {
      ssl: {
        require: true,
        rejectUnauthorized: false, // Railway/Postgres impose SSL
      },
    },
  },
};

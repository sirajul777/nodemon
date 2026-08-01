import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { join } from 'path';

@Global()
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      useFactory: () => {
        // Default: SQLite at data/mikhmon.db
        // Override with DATABASE_URL env for PostgreSQL
        const dbUrl = process.env.DATABASE_URL;
        if (dbUrl && dbUrl.startsWith('postgres')) {
          return {
            type: 'postgres',
            url: dbUrl,
            autoLoadEntities: true,
            synchronize: true,
            ssl: dbUrl.includes('sslmode=require')
              ? { rejectUnauthorized: false }
              : false,
          };
        }
        return {
          type: 'better-sqlite3',
          database: join(process.cwd(), 'data', 'mikhmon.db'),
          autoLoadEntities: true,
          synchronize: true,
        };
      },
    }),
  ],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}


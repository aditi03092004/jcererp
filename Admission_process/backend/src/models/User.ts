import { DataTypes, Model } from 'sequelize';
import db from '../config/database';
import bcrypt from 'bcryptjs';
import logger from '../utils/logger.util';

// Checks if the password hash conforms to secure hash string formats (Bcrypt, Argon2, Scrypt, etc.)
const isSecureHash = (hash: string): boolean => {
  if (!hash) return false;
  return hash.startsWith('$2') || /^\$[a-z0-9-]+\$/i.test(hash);
};

class User extends Model {
  public id!: string;
  public username!: string;
  public email!: string;
  public passwordHash!: string;
  public role!: 'SUPER_ADMIN' | 'ADMIN' | 'HOD' | 'TEACHER' | 'STUDENT' | 'PARENT' | 'PRINCIPAL' | 'DEAN' | 'CYBERADMIN';
  public status!: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' | 'PENDING_AUTHORIZATION';
  public firstName!: string;
  public middleName!: string | null;
  public lastName!: string;
  public gender!: string | null;
  public phone!: string;
  public profileImage!: string;
  public tokenVersion!: number;
  public mustChangePassword!: boolean;
  public registrationType!: 'FRESH' | 'LATERAL_ENTRY' | null;
  public lastActivityAt!: Date | null;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;

  // Method to check password validity with auto-migration to secure hashing
  public async comparePassword(password: string): Promise<boolean> {
    if (isSecureHash(this.passwordHash)) {
      try {
        return await bcrypt.compare(password, this.passwordHash);
      } catch (e) {
        return false;
      }
    }

    // Fallback comparison for legacy unhashed entries (e.g. from raw seed scripts)
    const isMatch = password === this.passwordHash;
    if (isMatch) {
      try {
        const oldHash = this.passwordHash;
        const salt = await bcrypt.genSalt(10);
        const hash = await bcrypt.hash(password, salt);

        // Perform an atomic update to prevent race conditions
        const [affectedCount] = await User.update(
          { passwordHash: hash },
          { where: { id: this.id, passwordHash: oldHash } }
        );

        if (affectedCount > 0) {
          this.passwordHash = hash;
          logger.warn(`EVENT: PASSWORD_MIGRATED | USER: ${this.email} | ROLE: ${this.role} | METHOD: Legacy Plaintext -> Bcrypt | TIME: ${new Date().toISOString()}`);
        } else {
          logger.warn(`Security Event: Password migration already completed by another request for user ID: ${this.id}`);
          await this.reload();
        }
      } catch (err: any) {
        logger.error(`Security Event Failure: Password migration failed for user ID: ${this.id} - ${err.message}`);
      }
    }
    return isMatch;
  }
}

User.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    username: {
      type: DataTypes.STRING(50),
      allowNull: true,
      unique: true,
    },
    email: {
      type: DataTypes.STRING(100),
      allowNull: false,
      unique: true,
      validate: {
        isEmail: true,
      },
    },
    passwordHash: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    role: {
      type: DataTypes.ENUM('SUPER_ADMIN', 'ADMIN', 'HOD', 'TEACHER', 'STUDENT', 'PARENT', 'PRINCIPAL', 'DEAN', 'CYBERADMIN'),
      allowNull: false,
    },
    status: {
      type: DataTypes.ENUM('ACTIVE', 'INACTIVE', 'SUSPENDED', 'PENDING_AUTHORIZATION'),
      allowNull: false,
      defaultValue: 'ACTIVE',
    },
    firstName: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    middleName: {
      type: DataTypes.STRING(50),
      allowNull: true,
      defaultValue: null,
    },
    lastName: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    gender: {
      type: DataTypes.STRING(20),
      allowNull: true,
      defaultValue: null,
    },
    phone: {
      type: DataTypes.STRING(20),
      allowNull: true,
    },
    profileImage: {
      type: DataTypes.STRING(255),
      allowNull: true,
      defaultValue: 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png',
    },
    tokenVersion: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
    },
    mustChangePassword: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    registrationType: {
      type: DataTypes.STRING(20),
      allowNull: true,
      defaultValue: 'FRESH',
    },
    lastActivityAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    sequelize: db,
    tableName: 'users',
    timestamps: true,
    indexes: [
      { fields: ['email'] },
      { fields: ['role'] },
      { fields: ['lastActivityAt'] },
    ],
    hooks: {
      beforeSave: async (user: User) => {
        if (user.changed('passwordHash') && !isSecureHash(user.passwordHash)) {
          const salt = await bcrypt.genSalt(10);
          user.passwordHash = await bcrypt.hash(user.passwordHash, salt);
        }
      },
    },
  }
);

export { User };
export default User;

---
name: zod
requires_deps: ["zod"]
---

# Zod Runtime Validation

Zod provides TypeScript-first runtime type validation.

## Schema Definition

```typescript
import { z } from 'zod';

export const UserSchema = z.object({
  email: z.string().email(),
  username: z.string().min(3).max(50),
  age: z.number().int().positive().optional(),
  role: z.enum(['user', 'admin', 'moderator']),
});

export type User = z.infer<typeof UserSchema>;
```

## API Validation

```typescript
// Express.js middleware
import { Request, Response, NextFunction } from 'express';
import { ZodSchema } from 'zod';

export const validateBody = (schema: ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      schema.parse(req.body);
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          error: 'Validation failed',
          details: error.errors,
        });
        return;
      }
      next(error);
    }
  };
};

// Usage
app.post('/users', validateBody(UserSchema), createUserHandler);
```

## Form Validation (React Hook Form)

```typescript
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

const LoginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

type LoginForm = z.infer<typeof LoginSchema>;

export function LoginForm() {
  const { register, handleSubmit, formState: { errors } } = useForm<LoginForm>({
    resolver: zodResolver(LoginSchema),
  });

  const onSubmit = (data: LoginForm) => {
    // data is fully type-safe
    console.log(data);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <input {...register('email')} />
      {errors.email && <span>{errors.email.message}</span>}

      <input type="password" {...register('password')} />
      {errors.password && <span>{errors.password.message}</span>}

      <button type="submit">Login</button>
    </form>
  );
}
```
